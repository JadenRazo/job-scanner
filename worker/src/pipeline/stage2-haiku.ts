import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import { runClaude } from "../llm/claude-cli.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { Stage1Row } from "../db/matches.js";
import type { ScorableResume } from "../db/profile.js";

const log = logger.child({ mod: "stage2" });

export interface CheapMatchResult {
  jobId: number;
  score: number;
  rationale: string;
  skills: string[];
  gaps: string[];
  bestResumeId: number | null;
}

const MatchSchema = z.object({
  index: z.number().int().positive(),
  // best_resume_id is nullable because a zero-score "nothing fits" is still
  // a valid response; the model should still return an id when it can.
  best_resume_id: z.number().int().nullable().default(null),
  score: z.number().int().min(0).max(100),
  // Generous cap — the model sometimes writes long rationales when reasoning
  // across multiple resumes AND the target bias. We truncate for display.
  rationale: z.string().min(1).max(1200),
  matched: z.array(z.string()).max(5).default([]),
  gaps: z.array(z.string()).max(5).default([]),
});
const EnvelopeSchema = z.object({
  matches: z.array(MatchSchema),
});

const SYSTEM_RUBRIC = `You are a brutally honest job-fit scorer for a single candidate.

The candidate may provide MULTIPLE resumes inside <resumes>, each targeting a different track (e.g. one main CV, one internship-focused, one entry-level). For each job, pick the resume that would produce the BEST interview outcome for that specific job, then score 0-100 on how realistically the candidate would land a FIRST-round interview USING THAT RESUME.

Base score anchors:
  95-100  Strong direct fit. Title + stack + seniority all align.
  80-94   Good fit with one small gap. Worth applying.
  70-79   Plausible stretch. Apply if the candidate is hungry.
  50-69   Mismatch on seniority, domain, or stack. Skip.
  0-49    Not even close.

Rules:
  - Do NOT flatter. 70 is the floor for "apply".
  - Do NOT use generic phrases ("great opportunity", "exciting role"). Be concrete.
  - "matched" is up to 3 specific skills / experiences from the WINNING resume that the job asks for.
  - "gaps" is up to 3 specific things the job asks for that the WINNING resume does NOT clearly show.
  - Return the id of the chosen resume in "best_resume_id" — it MUST be one of the ids listed in <resumes>.
  - If the job is clearly non-technical when the candidate is technical (or vice versa), score under 30.
  - Location/remote is NOT your concern — assume it's already filtered.
  - If a <target> block is provided, apply its biases ON TOP of the base rubric before emitting the final score.

Output format:
  - Output MUST be a single VALID JSON object wrapped in {"matches":[...]}.
  - Rationale: plain prose, ≤ 300 characters, NO double quotes, NO newlines, NO backslashes. Use single quotes for code or names.
  - Do NOT reference rule letters like "(a)" or "(b)" in rationale text — just explain the call directly.
  - No prose before or after the JSON. No markdown fences. Compact JSON, one line per match if possible.

Example shape:
{"matches":[{"index":1,"best_resume_id":10,"score":85,"rationale":"SRE internship at Stripe, direct stack match (Kubernetes, Terraform). Intern resume wins over main CV.","matched":["Kubernetes","Terraform","AWS"],"gaps":["on-call production experience"]}]}`;

function truncateDescription(md: string | null, maxChars = 2400): string {
  if (!md) return "(no description provided)";
  if (md.length <= maxChars) return md;
  return md.slice(0, maxChars) + "\n...[truncated]";
}

function buildPrompt(
  jobs: Stage1Row[],
  resumes: ScorableResume[],
  targetRoles: string,
): string {
  const list = jobs
    .map((j, idx) => {
      const header = `## ${idx + 1}. ${j.title} — ${j.companyName}`;
      const meta = j.location ? `Location: ${j.location}` : "";
      return `${header}\n${meta}\n\n${truncateDescription(j.descriptionMd)}`;
    })
    .join("\n\n---\n\n");

  const resumesBlock = resumes
    .map(
      (r) =>
        `<resume id="${r.id}" label="${r.label}">\n${r.contentMd.trim()}\n</resume>`,
    )
    .join("\n\n");

  const targetBlock = targetRoles.trim()
    ? `\n<target>\n${targetRoles.trim()}\n</target>\n`
    : "";

  const resumeIds = resumes.map((r) => r.id).join(", ");

  return `${SYSTEM_RUBRIC}

<resumes>
${resumesBlock}
</resumes>
${targetBlock}
<jobs>
${list}
</jobs>

Available resume ids for best_resume_id: ${resumeIds}.
Return the JSON envelope for ${jobs.length} jobs now.`;
}

/**
 * Extract the first balanced JSON object from a response string. Claude
 * sometimes wraps JSON in a fence or prefaces it with a short explainer
 * despite instructions; this recovers the object.
 */
function extractJson(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  if (open === -1 || close === -1 || close < open) {
    throw new Error("no JSON object in response");
  }
  return text.slice(open, close + 1);
}

/**
 * Parse JSON with a repair fallback for the common model failure modes
 * (unescaped inner quotes, trailing commas, single quotes, newlines in
 * strings). jsonrepair is pure JS and deterministic — if it can't fix it,
 * we throw and the caller records a parse-error row for the batch.
 */
function parseJsonTolerant(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const repaired = jsonrepair(text);
    return JSON.parse(repaired);
  }
}

function parseResponse(
  text: string,
  batch: Stage1Row[],
  validResumeIds: Set<number>,
): CheapMatchResult[] {
  const json = extractJson(text);
  const parsed = parseJsonTolerant(json);
  const envelope = EnvelopeSchema.parse(parsed);

  // Map by (1-based) index → job. Unmatched indices get a default low score
  // so we at least record SOMETHING for every job in the batch.
  const byIdx = new Map<number, (typeof envelope.matches)[number]>();
  for (const m of envelope.matches) byIdx.set(m.index, m);

  return batch.map((job, i) => {
    const m = byIdx.get(i + 1);
    if (!m) {
      log.warn({ jobId: job.jobId, batchIndex: i + 1 }, "no score returned for job");
      return {
        jobId: job.jobId,
        score: 0,
        rationale: "model did not return a score for this entry",
        skills: [],
        gaps: [],
        bestResumeId: null,
      };
    }
    // Accept model's resume pick only if it's one of the ids we actually
    // sent; otherwise drop to null rather than persisting a dangling FK.
    const bestResumeId =
      m.best_resume_id != null && validResumeIds.has(m.best_resume_id)
        ? m.best_resume_id
        : null;
    return {
      jobId: job.jobId,
      score: m.score,
      rationale: m.rationale.trim(),
      skills: m.matched,
      gaps: m.gaps,
      bestResumeId,
    };
  });
}

/**
 * Batched Haiku scoring. One CLI call scores up to STAGE2_BATCH_SIZE jobs
 * against ALL provided resumes, picking the best resume per job. Caller is
 * responsible for pre-filtering via Stage 1.
 */
export async function stage2HaikuBatch(
  jobs: Stage1Row[],
  resumes: ScorableResume[],
  targetRoles: string = "",
): Promise<CheapMatchResult[]> {
  if (jobs.length === 0) return [];
  if (resumes.length === 0) {
    log.warn("no resumes — cannot score; skipping batch");
    return [];
  }

  const validResumeIds = new Set(resumes.map((r) => r.id));
  const batchSize = config.STAGE2_BATCH_SIZE;
  const results: CheapMatchResult[] = [];

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    log.info(
      { from: i, size: batch.length, total: jobs.length, resumes: resumes.length },
      "stage2 batch",
    );

    const prompt = buildPrompt(batch, resumes, targetRoles);

    let text: string;
    try {
      const res = await runClaude({
        prompt,
        model: config.CHEAP_MODEL,
        purpose: "stage2-batch",
        // Haiku with our ~4k-prompt + ~7k-output takes 60-90s per call.
        // 240s leaves ample head-room for slow responses.
        timeoutMs: 240_000,
      });
      text = res.text;
    } catch (err) {
      // Per-batch resilience: record a failure marker for each job in the
      // batch and continue to the next batch. Losing a batch's worth of
      // results is annoying; losing the whole pass is worse.
      log.error(
        { err: (err as Error).message, from: i, size: batch.length },
        "stage2 batch call failed — recording zeros",
      );
      for (const j of batch) {
        results.push({
          jobId: j.jobId,
          score: 0,
          rationale: `llm call failed: ${(err as Error).message.slice(0, 200)}`,
          skills: [],
          gaps: [],
          bestResumeId: null,
        });
      }
      continue;
    }

    try {
      const parsed = parseResponse(text, batch, validResumeIds);
      results.push(...parsed);
    } catch (err) {
      log.error(
        { err: (err as Error).message, preview: text.slice(0, 300) },
        "stage2 parse failed — recording zeros for batch",
      );
      for (const j of batch) {
        results.push({
          jobId: j.jobId,
          score: 0,
          rationale: `parse error: ${(err as Error).message.slice(0, 200)}`,
          skills: [],
          gaps: [],
          bestResumeId: null,
        });
      }
    }
  }

  return results;
}

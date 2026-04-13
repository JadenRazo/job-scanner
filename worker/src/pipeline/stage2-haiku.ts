import { z } from "zod";
import { runClaude } from "../llm/claude-cli.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { Stage1Row } from "../db/matches.js";

const log = logger.child({ mod: "stage2" });

export interface CheapMatchResult {
  jobId: number;
  score: number;
  rationale: string;
  skills: string[];
  gaps: string[];
}

const MatchSchema = z.object({
  index: z.number().int().positive(),
  score: z.number().int().min(0).max(100),
  rationale: z.string().min(1).max(400),
  matched: z.array(z.string()).max(5).default([]),
  gaps: z.array(z.string()).max(5).default([]),
});
const EnvelopeSchema = z.object({
  matches: z.array(MatchSchema),
});

const SYSTEM_RUBRIC = `You are a brutally honest job-fit scorer for a single candidate.

For each job posting, score 0-100 on how realistically the candidate would land a FIRST-round interview, then explain the score in one terse line.

Score anchors:
  95-100  Strong direct fit. Title + stack + seniority all align.
  80-94   Good fit with one small gap. Worth applying.
  70-79   Plausible stretch. Apply if the candidate is hungry.
  50-69   Mismatch on seniority, domain, or stack. Skip.
  0-49    Not even close.

Rules:
  - Do NOT flatter. 70 is the floor for "apply".
  - Do NOT use generic phrases ("great opportunity", "exciting role"). Be concrete about what matches and what doesn't.
  - "matched" is up to 3 specific skills / technologies / experiences from the resume that the job asks for.
  - "gaps" is up to 3 specific things the job asks for that the resume does NOT clearly show.
  - If the job is clearly non-technical when the candidate is technical (or vice versa), score under 30.
  - Location/remote is NOT your concern — assume it's already filtered.

Output MUST be a single JSON object of the form:
{"matches":[{"index":1,"score":72,"rationale":"...","matched":["..."],"gaps":["..."]}, ...]}

No prose, no markdown fences, no trailing text. Just the JSON.`;

function truncateDescription(md: string | null, maxChars = 2400): string {
  if (!md) return "(no description provided)";
  if (md.length <= maxChars) return md;
  return md.slice(0, maxChars) + "\n...[truncated]";
}

function buildPrompt(jobs: Stage1Row[], resumeMd: string): string {
  const list = jobs
    .map((j, idx) => {
      const header = `## ${idx + 1}. ${j.title} — ${j.companyName}`;
      const meta = j.location ? `Location: ${j.location}` : "";
      return `${header}\n${meta}\n\n${truncateDescription(j.descriptionMd)}`;
    })
    .join("\n\n---\n\n");

  return `${SYSTEM_RUBRIC}

<resume>
${resumeMd.trim()}
</resume>

<jobs>
${list}
</jobs>

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

function parseResponse(text: string, batch: Stage1Row[]): CheapMatchResult[] {
  const json = extractJson(text);
  const parsed = JSON.parse(json);
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
      };
    }
    return {
      jobId: job.jobId,
      score: m.score,
      rationale: m.rationale.trim(),
      skills: m.matched,
      gaps: m.gaps,
    };
  });
}

/**
 * Batched Haiku scoring. One CLI call scores up to STAGE2_BATCH_SIZE jobs.
 * Caller is responsible for pre-filtering via Stage 1.
 */
export async function stage2HaikuBatch(
  jobs: Stage1Row[],
  resumeMd: string,
): Promise<CheapMatchResult[]> {
  if (jobs.length === 0) return [];
  if (!resumeMd.trim()) {
    log.warn("empty resume — cannot score; skipping batch");
    return [];
  }

  const batchSize = config.STAGE2_BATCH_SIZE;
  const results: CheapMatchResult[] = [];

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    log.info({ from: i, size: batch.length, total: jobs.length }, "stage2 batch");

    const prompt = buildPrompt(batch, resumeMd);

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
        });
      }
      continue;
    }

    try {
      const parsed = parseResponse(text, batch);
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
        });
      }
    }
  }

  return results;
}

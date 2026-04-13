import type { ScrapedJob } from "../scrapers/types.js";
import { runClaude } from "../llm/claude-cli.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "stage3" });

/**
 * TODO(phase5): paste the full "Cover Letter Generation Prompt" from the plan
 * file into this constant verbatim. Keeping it as a placeholder until Phase 5
 * so Phase 1 smoke tests don't ship the 4kB spec in compiled output.
 * See /root/.claude/plans/groovy-swimming-abelson.md §"Match pipeline — Stage 3".
 */
export const COVER_LETTER_SYSTEM_PROMPT = `You are a placeholder Stage 3 prompt. Replace in Phase 5.`;

export interface DeepMatchResult {
  score: number;
  rationale: string;
  skills: string[];
  gaps: string[];
  analysisMd: string;
  letterBodyMd: string;
}

/**
 * Deep pass — Sonnet with the full cover-letter prompt. Runs only on Stage 2
 * winners (score ≥ threshold), typically 5-10 jobs/day, one call each.
 */
export async function stage3Sonnet(
  job: ScrapedJob,
  resumeMd: string,
): Promise<DeepMatchResult> {
  log.info({ title: job.title, companyId: job.companyId }, "stage3 call");

  const prompt = `${COVER_LETTER_SYSTEM_PROMPT}

<resume>
${resumeMd}
</resume>

<job>
Title: ${job.title}
Location: ${job.location ?? "unspecified"}
URL: ${job.url}

${job.descriptionMd ?? ""}
</job>`;

  const _res = await runClaude({
    prompt,
    model: "sonnet",
    purpose: "stage3-deep",
    timeoutMs: 180_000,
  });

  // TODO(phase5): parse structured sections out of _res.text
  return {
    score: 0,
    rationale: "todo",
    skills: [],
    gaps: [],
    analysisMd: "",
    letterBodyMd: "",
  };
}

import { Worker } from "bullmq";
import { connection } from "../queue/connection.js";
import { QUEUE_NAMES, notifyQueue } from "../queue/queues.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { loadProfile, loadScorableResumes } from "../db/profile.js";
import { fetchStage1Survivors, writeStage2Match } from "../db/matches.js";
import { stage2HaikuBatch } from "../pipeline/stage2-haiku.js";
import { QuotaExceededError } from "../llm/quota-guard.js";
import { ClaudeRateLimitError } from "../llm/claude-cli.js";

const log = logger.child({ mod: "match-cheap" });

async function runPass(): Promise<{ scored: number; notified: number; skipped: boolean }> {
  const profile = await loadProfile();

  if (profile.paused) {
    log.info("profile paused — skipping pass");
    return { scored: 0, notified: 0, skipped: true };
  }

  const resumes = await loadScorableResumes();
  if (resumes.length === 0) {
    log.warn("no resumes uploaded — skipping Stage 2 (upload one on /resumes)");
    return { scored: 0, notified: 0, skipped: true };
  }

  const survivors = await fetchStage1Survivors(profile, config.MATCH_CHEAP_MAX_PER_PASS);
  log.info(
    {
      count: survivors.length,
      cap: config.MATCH_CHEAP_MAX_PER_PASS,
      resumes: resumes.map((r) => r.label),
    },
    "stage1 survivors",
  );
  if (survivors.length === 0) return { scored: 0, notified: 0, skipped: false };

  let results;
  try {
    results = await stage2HaikuBatch(survivors, resumes, profile.targetRoles);
  } catch (err) {
    if (err instanceof QuotaExceededError || err instanceof ClaudeRateLimitError) {
      log.warn({ err: (err as Error).message }, "llm quota/rate limit hit — pass aborted");
      return { scored: 0, notified: 0, skipped: true };
    }
    throw err;
  }

  let notified = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const job = survivors[i];
    await writeStage2Match({
      jobId: r.jobId,
      stage1Pass: true,
      stage2Score: r.score,
      stage2Rationale: r.rationale,
      stage2Skills: r.skills,
      stage2Gaps: r.gaps,
      bestResumeId: r.bestResumeId,
    });

    if (r.score >= profile.scoreThreshold) {
      await notifyQueue.add(
        "match",
        {
          jobId: job.jobId,
          title: job.title,
          company: job.companyName,
          location: job.location,
          url: job.url,
          score: r.score,
          rationale: r.rationale,
          matched: r.skills,
          gaps: r.gaps,
        },
        { removeOnComplete: { age: 3600, count: 500 } },
      );
      notified++;
    }
  }

  log.info({ scored: results.length, notified }, "stage2 pass complete");
  return { scored: results.length, notified, skipped: false };
}

export function createMatchCheapWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.matchCheap,
    async (job) => {
      log.info({ id: job.id, name: job.name }, "match-cheap job");
      return await runPass();
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    log.error({ id: job?.id, err: err.message }, "match-cheap job failed");
  });

  return worker;
}

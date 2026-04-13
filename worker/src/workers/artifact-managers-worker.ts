import { Worker } from "bullmq";
import { connection } from "../queue/connection.js";
import { QUEUE_NAMES } from "../queue/queues.js";
import { logger } from "../logger.js";
import { runClaude, ClaudeRateLimitError } from "../llm/claude-cli.js";
import { QuotaExceededError } from "../llm/quota-guard.js";
import {
  loadJobForArtifact,
  markManagersStatus,
} from "../db/artifacts.js";
import { HIRING_MANAGERS_PROMPT } from "../pipeline/artifact-prompts.js";

const log = logger.child({ mod: "artifact-managers" });

interface Guess {
  title: string;
  why: string;
  searchQuery: string;
  confidence: "high" | "medium" | "low";
  linkedinSearchUrl: string;
}

interface ManagersPayload {
  guesses: Guess[];
  notes: string;
  company: string;
  generatedAt: string;
}

function buildLinkedinSearchUrl(company: string, query: string): string {
  const kw = `${query} ${company}`.replace(/\s+/g, " ").trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(kw)}&origin=GLOBAL_SEARCH_HEADER`;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1] : trimmed;
}

interface RawResp {
  guesses?: Array<{
    title?: string;
    why?: string;
    searchQuery?: string;
    confidence?: string;
  }>;
  notes?: string;
}

function parseResponse(text: string, company: string): ManagersPayload {
  const raw = JSON.parse(stripCodeFence(text)) as RawResp;
  const guesses: Guess[] = (raw.guesses ?? [])
    .filter(
      (g): g is { title: string; why: string; searchQuery: string; confidence: string } =>
        typeof g.title === "string" &&
        typeof g.why === "string" &&
        typeof g.searchQuery === "string" &&
        typeof g.confidence === "string",
    )
    .slice(0, 6)
    .map((g) => ({
      title: g.title.trim(),
      why: g.why.trim(),
      searchQuery: g.searchQuery.trim(),
      confidence:
        g.confidence === "high" || g.confidence === "medium" || g.confidence === "low"
          ? g.confidence
          : "medium",
      linkedinSearchUrl: buildLinkedinSearchUrl(company, g.searchQuery),
    }));
  if (guesses.length === 0) {
    throw new Error("no valid guesses parsed from LLM output");
  }
  return {
    guesses,
    notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 500) : "",
    company,
    generatedAt: new Date().toISOString(),
  };
}

async function runManagers(matchId: number): Promise<void> {
  const job = await loadJobForArtifact(matchId);
  if (!job) {
    log.warn({ matchId }, "match not found");
    return;
  }
  await markManagersStatus(matchId, "running");

  const prompt = `${HIRING_MANAGERS_PROMPT}

<job>
Title: ${job.title}
Company: ${job.companyName}
Location: ${job.location ?? "unspecified"}
Remote: ${job.remote ? "yes" : "no"}
Seniority: ${job.seniority ?? "unspecified"}
URL: ${job.url}

Description:
${(job.descriptionMd ?? "").slice(0, 12_000)}
</job>`;

  const res = await runClaude({
    prompt,
    model: "sonnet",
    purpose: "artifact-managers",
    timeoutMs: 120_000,
  });

  const payload = parseResponse(res.text, job.companyName);
  await markManagersStatus(matchId, "ready", { guesses: payload });
  log.info(
    { matchId, guesses: payload.guesses.length, costUsd: res.totalCostUsd },
    "managers ready",
  );
}

export function createArtifactManagersWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.artifactManagers,
    async (job) => {
      const matchId = Number((job.data as { matchId: number }).matchId);
      log.info({ id: job.id, matchId }, "managers job start");
      try {
        await runManagers(matchId);
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        log.error({ matchId, err: msg }, "managers job failed");
        const isQuota =
          err instanceof QuotaExceededError || err instanceof ClaudeRateLimitError;
        await markManagersStatus(matchId, "error", {
          error: isQuota
            ? "Claude quota/rate limit reached. Try again in a few minutes."
            : msg.slice(0, 500),
        });
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    log.error({ id: job?.id, err: err.message }, "managers worker failed");
  });

  return worker;
}

import { connection as redis } from "../queue/connection.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "quota-guard" });

/** 5h sliding window, in milliseconds. */
const WINDOW_MS = 5 * 60 * 60 * 1000;

/** Redis sorted set key. Score = claim timestamp (ms), member = unique id. */
const KEY = "jobscanner:llm:claims";

export class QuotaExceededError extends Error {
  constructor(public readonly currentCount: number, public readonly cap: number) {
    super(`LLM quota exceeded: ${currentCount}/${cap} in last 5h`);
    this.name = "QuotaExceededError";
  }
}

/**
 * Reserve one slot in the 5h sliding window. Throws QuotaExceededError when
 * the hard cap is reached. Successful claims are NOT released on failure —
 * the cap is intentionally a ceiling on "intent to call", not on billed calls.
 * This is the safer direction for staying under Anthropic limits.
 */
export async function claimQuota(purpose: string): Promise<{ count: number; cap: number }> {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const cap = config.LLM_MAX_CALLS_PER_5H;

  // Drop expired entries, then count. Do count BEFORE adding so a racing
  // second caller doesn't see their own slot.
  const pipe = redis.multi();
  pipe.zremrangebyscore(KEY, 0, cutoff);
  pipe.zcard(KEY);
  const results = await pipe.exec();
  if (!results) throw new Error("redis pipeline failed");

  const currentRaw = results[1]?.[1];
  const current = typeof currentRaw === "number" ? currentRaw : Number(currentRaw ?? 0);

  if (current >= cap) {
    log.warn({ purpose, current, cap }, "quota exceeded — refusing call");
    throw new QuotaExceededError(current, cap);
  }

  const member = `${now}:${purpose}:${Math.random().toString(36).slice(2, 10)}`;
  await redis.zadd(KEY, now, member);
  // Expire the whole key after the window so we don't accumulate dead data.
  await redis.pexpire(KEY, WINDOW_MS + 60_000);

  const newCount = current + 1;
  log.debug({ purpose, count: newCount, cap }, "quota claimed");
  return { count: newCount, cap };
}

/** Read-only introspection — useful for the dashboard + health checks. */
export async function quotaStatus(): Promise<{ count: number; cap: number; windowMs: number }> {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  await redis.zremrangebyscore(KEY, 0, cutoff);
  const count = await redis.zcard(KEY);
  return { count, cap: config.LLM_MAX_CALLS_PER_5H, windowMs: WINDOW_MS };
}

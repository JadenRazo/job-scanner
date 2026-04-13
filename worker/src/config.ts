import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // LLM — CLI-only, no API key. Models use Claude Code aliases.
  CHEAP_MODEL: z.string().default("haiku"),
  DEEP_MODEL: z.string().default("sonnet"),

  // Hard ceiling on Claude CLI calls in any rolling 5h window. Max 5x gives
  // roughly 225 Sonnet-equivalent msgs per 5h; 30 is a conservative 13% of
  // that, leaving enormous headroom for interactive use from the host.
  LLM_MAX_CALLS_PER_5H: z.coerce.number().int().positive().default(30),

  // Human-pacing jitter applied before every LLM call. Ranges are chosen so
  // a burst of sequential calls looks like a human reading each answer before
  // issuing the next.
  LLM_JITTER_MIN_MS: z.coerce.number().int().nonnegative().default(8_000),
  LLM_JITTER_MAX_MS: z.coerce.number().int().positive().default(45_000),

  // Stage 2 batching — 15 JDs per Haiku prompt keeps tokens ~3-4k per call.
  STAGE2_BATCH_SIZE: z.coerce.number().int().positive().default(15),

  // Hard cap on how many stage-1 survivors a single match-cheap pass will
  // score. Keeps one triggered run from blowing through the 5h quota — the
  // scheduler will pick up the rest on the next tick.
  MATCH_CHEAP_MAX_PER_PASS: z.coerce.number().int().positive().default(45),

  DISCORD_WEBHOOK_URL: z.string().optional(),
  DASHBOARD_BASE_URL: z.string().optional(),

  LETTERS_DIR: z.string().default("/app/data/letters"),
  USER_AGENT: z
    .string()
    .default("raizhost-job-scanner bot - jaden@raizhost.com"),
  TZ: z.string().default("America/Los_Angeles"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = parsed.data;
export type Config = typeof config;

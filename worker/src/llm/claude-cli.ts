import { spawn } from "node:child_process";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { claimQuota, QuotaExceededError } from "./quota-guard.js";

const log = logger.child({ mod: "claude-cli" });

interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function spawnWithStdin(
  cmd: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HOME: process.env.HOME ?? "/app" },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, code });
    });

    child.stdin.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.stdin.end(stdin);
  });
}

export class ClaudeRateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSec?: number) {
    super(message);
    this.name = "ClaudeRateLimitError";
  }
}

export class ClaudeCliError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

export interface ClaudeCallOptions {
  /** Prompt text; passed via stdin to avoid CLI argv length limits. */
  prompt: string;
  /** Model alias: "haiku" | "sonnet" | "opus" or full ID. */
  model: "haiku" | "sonnet" | "opus" | string;
  /** Per-call timeout, default 120s. */
  timeoutMs?: number;
  /**
   * Purpose label for logging + quota bookkeeping. Not sent to the model.
   * Example: "stage2-batch" or "stage3-deep".
   */
  purpose: string;
  /** Skip human-pacing jitter (used for latency-sensitive calls). Default false. */
  skipJitter?: boolean;
}

export interface ClaudeCallResult {
  text: string;
  durationMs: number;
  totalCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Jitter distribution matches how a human uses Claude in terminal: long
 * pauses between prompts, never in lock-step. Range chosen so bursts of
 * N calls look like somebody reading between each response.
 */
function pickJitterMs(): number {
  return config.LLM_JITTER_MIN_MS + Math.floor(Math.random() * (config.LLM_JITTER_MAX_MS - config.LLM_JITTER_MIN_MS));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the assistant text from a `claude --output-format json` envelope.
 *
 * Claude Code v2 prints a single JSON object with a `result` field containing
 * the assistant's final text. Older/alternate formats use `content[0].text`.
 * Accept both defensively.
 */
function extractText(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.result === "string") return obj.result;

  const content = obj.content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown>;
    if (typeof first.text === "string") return first.text;
  }

  return null;
}

/**
 * Rate-limit sniffer. Scans stderr ONLY — stdout may contain model text that
 * legitimately mentions rate limits (e.g. a JD talking about pay bands) and
 * that previously false-positive'd the whole pipeline. For real rate limits
 * the CLI writes to stderr and/or sets is_error=true in the JSON envelope,
 * both of which we check.
 */
function stderrLooksRateLimited(stderr: string): boolean {
  const hay = stderr.toLowerCase();
  return (
    hay.includes("rate_limit_error") ||
    hay.includes("too many requests") ||
    hay.includes(" 429") ||
    hay.includes("usage limit exceeded")
  );
}

function envelopeIsRateLimit(envelope: Record<string, unknown>): boolean {
  if (envelope.is_error !== true) return false;
  const subtype = typeof envelope.subtype === "string" ? envelope.subtype.toLowerCase() : "";
  const result = typeof envelope.result === "string" ? envelope.result.toLowerCase() : "";
  return (
    subtype.includes("rate_limit") ||
    result.includes("rate_limit_error") ||
    result.includes("usage limit") ||
    result.includes("too many requests")
  );
}

/**
 * Run a single stateless Claude call via the CLI, honouring the 5h quota
 * guard and human-pacing jitter. This is the ONLY entry point the pipeline
 * should use for LLM calls.
 */
export async function runClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  // Reserve a slot BEFORE any delay, so we fail fast if quota is exhausted.
  await claimQuota(opts.purpose);

  if (!opts.skipJitter) {
    const jitter = pickJitterMs();
    log.debug({ purpose: opts.purpose, jitterMs: jitter }, "pre-call jitter");
    await sleep(jitter);
  }

  const args = [
    "-p",
    "--model",
    opts.model,
    "--output-format",
    "json",
  ];

  const start = Date.now();
  try {
    const { stdout, stderr, code } = await spawnWithStdin(
      "claude",
      args,
      opts.prompt,
      opts.timeoutMs ?? 120_000,
    );

    const durationMs = Date.now() - start;

    if (stderrLooksRateLimited(stderr)) {
      throw new ClaudeRateLimitError(`stderr: ${stderr.slice(0, 300)}`);
    }

    if (code !== 0) {
      throw new ClaudeCliError(`claude exited with code ${code}`, stderr.slice(0, 500));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      throw new ClaudeCliError(`Failed to parse JSON output: ${(err as Error).message}`, stdout.slice(0, 500));
    }

    const envelope = parsed as Record<string, unknown>;

    if (envelopeIsRateLimit(envelope)) {
      throw new ClaudeRateLimitError(`envelope: ${String(envelope.result ?? envelope.subtype).slice(0, 300)}`);
    }

    if (envelope.is_error === true) {
      throw new ClaudeCliError(
        `Claude returned is_error=true: ${String(envelope.result ?? envelope.subtype).slice(0, 300)}`,
      );
    }

    const text = extractText(parsed);
    if (text == null) {
      throw new ClaudeCliError("JSON envelope missing result/content text", JSON.stringify(parsed).slice(0, 500));
    }

    const usage = (envelope.usage ?? {}) as Record<string, unknown>;

    const result: ClaudeCallResult = {
      text,
      durationMs,
      totalCostUsd: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : undefined,
      inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
      outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
    };

    log.info(
      {
        purpose: opts.purpose,
        model: opts.model,
        durationMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.totalCostUsd,
      },
      "claude call ok",
    );

    return result;
  } catch (err) {
    if (err instanceof ClaudeRateLimitError || err instanceof QuotaExceededError || err instanceof ClaudeCliError) {
      throw err;
    }
    const msg = (err as Error).message ?? String(err);
    log.error({ purpose: opts.purpose, err: msg }, "claude call failed");
    throw new ClaudeCliError(msg);
  }
}

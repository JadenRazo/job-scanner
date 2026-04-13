import { Worker } from "bullmq";
import { connection } from "../queue/connection.js";
import { QUEUE_NAMES } from "../queue/queues.js";
import { logger } from "../logger.js";
import { runClaude, ClaudeRateLimitError } from "../llm/claude-cli.js";
import { QuotaExceededError } from "../llm/quota-guard.js";
import {
  loadJobForArtifact,
  loadResumeForArtifact,
  markTailorStatus,
  saveTailorBinaries,
} from "../db/artifacts.js";
import { loadProfile } from "../db/profile.js";
import { TAILOR_PROMPT } from "../pipeline/artifact-prompts.js";
import {
  docxToPdf,
  renderLetterDocx,
  renderResumeDocx,
} from "../pipeline/resume-render.js";

const log = logger.child({ mod: "artifact-tailor" });

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1] : trimmed;
}

interface RawResp {
  resume_md?: string;
  letter_md?: string;
}

function parseResponse(text: string): { resumeMd: string; letterMd: string } {
  // Claude sometimes wraps JSON in prose despite instructions. Try parse-or-find.
  const stripped = stripCodeFence(text);
  let raw: RawResp;
  try {
    raw = JSON.parse(stripped) as RawResp;
  } catch {
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("could not locate JSON object in tailor output");
    }
    raw = JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as RawResp;
  }
  if (typeof raw.resume_md !== "string" || raw.resume_md.trim().length === 0) {
    throw new Error("tailor output missing resume_md");
  }
  if (typeof raw.letter_md !== "string" || raw.letter_md.trim().length === 0) {
    throw new Error("tailor output missing letter_md");
  }
  return { resumeMd: raw.resume_md, letterMd: raw.letter_md };
}

async function runTailor(matchId: number): Promise<void> {
  const job = await loadJobForArtifact(matchId);
  if (!job) {
    log.warn({ matchId }, "match not found");
    return;
  }
  const resume = await loadResumeForArtifact(job.bestResumeId);
  if (!resume) {
    await markTailorStatus(matchId, "error", {
      error: "No resume uploaded — add one on /resumes first.",
    });
    return;
  }
  const profile = await loadProfile();

  await markTailorStatus(matchId, "running");

  const prompt = `${TAILOR_PROMPT}

<applicant>
Name: ${profile.fullName ?? "(not set)"}
Email: ${profile.contactEmail ?? "(not set)"}
</applicant>

<source_resume>
${resume.contentMd}
</source_resume>

<job>
Title: ${job.title}
Company: ${job.companyName}
Location: ${job.location ?? "unspecified"}
Remote: ${job.remote ? "yes" : "no"}
URL: ${job.url}

Description:
${(job.descriptionMd ?? "").slice(0, 12_000)}
</job>

<match_context>
Why matched: ${job.stage2Rationale ?? "n/a"}
Relevant skills already on resume: ${job.stage2Skills.join(", ") || "n/a"}
Known gaps (do not paper over these): ${job.stage2Gaps.join(", ") || "none noted"}
</match_context>`;

  const res = await runClaude({
    prompt,
    model: "sonnet",
    purpose: "artifact-tailor",
    timeoutMs: 240_000,
  });

  const { resumeMd, letterMd } = parseResponse(res.text);

  // Render ATS-friendly binaries. DOCX is produced in-process, PDF by
  // converting the DOCX with headless LibreOffice so the text layer matches
  // exactly. Failures here are non-fatal: we still save the markdown so the
  // user has something, then surface the render error through tailor_error.
  let renderError: string | null = null;
  let bins: {
    resumeDocx: Buffer;
    resumePdf: Buffer;
    letterDocx: Buffer;
    letterPdf: Buffer;
  } | null = null;
  try {
    const applicantName = profile.fullName ?? "Applicant";
    const resumeDocx = await renderResumeDocx(resumeMd, applicantName);
    const letterDocx = await renderLetterDocx(
      letterMd,
      applicantName,
      profile.contactEmail,
      job.title,
      job.companyName,
    );
    // soffice --headless uses shared /tmp state beyond the UserInstallation
    // dir, so concurrent conversions intermittently fail with exit 1. Each
    // call is 2-5s; serializing is cheap.
    const resumePdf = await docxToPdf(resumeDocx);
    const letterPdf = await docxToPdf(letterDocx);
    bins = { resumeDocx, resumePdf, letterDocx, letterPdf };
  } catch (err) {
    renderError = (err as Error).message ?? String(err);
    log.error({ matchId, err: renderError }, "render failed");
  }

  await markTailorStatus(matchId, "ready", { resumeMd, letterMd });
  if (bins) {
    await saveTailorBinaries(matchId, bins);
  } else if (renderError) {
    // Mark status ready (markdown is usable) but surface the render problem.
    await markTailorStatus(matchId, "ready", {
      error: `Markdown ready; DOCX/PDF render failed: ${renderError.slice(0, 400)}`,
    });
  }

  log.info(
    {
      matchId,
      resumeChars: resumeMd.length,
      letterChars: letterMd.length,
      rendered: Boolean(bins),
      costUsd: res.totalCostUsd,
    },
    "tailor ready",
  );
}

export function createArtifactTailorWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.artifactTailor,
    async (job) => {
      const matchId = Number((job.data as { matchId: number }).matchId);
      log.info({ id: job.id, matchId }, "tailor job start");
      try {
        await runTailor(matchId);
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        log.error({ matchId, err: msg }, "tailor job failed");
        const isQuota =
          err instanceof QuotaExceededError || err instanceof ClaudeRateLimitError;
        await markTailorStatus(matchId, "error", {
          error: isQuota
            ? "Claude quota/rate limit reached. Try again in a few minutes."
            : msg.slice(0, 500),
        });
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    log.error({ id: job?.id, err: err.message }, "tailor worker failed");
  });

  return worker;
}

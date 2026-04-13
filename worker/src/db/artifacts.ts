// Query helpers for the on-demand artifacts columns on job_matches.
// Used by the artifact-managers and artifact-tailor workers.

import { pool } from "./client.js";

export interface JobForArtifact {
  matchId: number;
  jobId: number;
  title: string;
  companyName: string;
  location: string | null;
  remote: boolean | null;
  seniority: string | null;
  url: string;
  descriptionMd: string | null;
  stage2Skills: string[];
  stage2Gaps: string[];
  stage2Rationale: string | null;
  bestResumeId: number | null;
}

interface RawRow {
  match_id: string;
  job_id: string;
  title: string;
  company_name: string;
  location: string | null;
  remote: boolean | null;
  seniority: string | null;
  url: string;
  description_md: string | null;
  stage2_skills: unknown;
  stage2_gaps: unknown;
  stage2_rationale: string | null;
  best_resume_id: string | null;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

export async function loadJobForArtifact(
  matchId: number,
): Promise<JobForArtifact | null> {
  const { rows } = await pool.query<RawRow>(
    `SELECT m.id            AS match_id,
            r.id            AS job_id,
            r.title         AS title,
            c.name          AS company_name,
            r.location      AS location,
            r.remote        AS remote,
            r.seniority     AS seniority,
            r.url           AS url,
            r.description_md AS description_md,
            m.stage2_skills AS stage2_skills,
            m.stage2_gaps   AS stage2_gaps,
            m.stage2_rationale AS stage2_rationale,
            m.best_resume_id AS best_resume_id
       FROM job_matches m
       JOIN raw_jobs r  ON r.id = m.job_id
       JOIN companies c ON c.id = r.company_id
      WHERE m.id = $1`,
    [matchId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    matchId: Number(row.match_id),
    jobId: Number(row.job_id),
    title: row.title,
    companyName: row.company_name,
    location: row.location,
    remote: row.remote,
    seniority: row.seniority,
    url: row.url,
    descriptionMd: row.description_md,
    stage2Skills: toStringArray(row.stage2_skills),
    stage2Gaps: toStringArray(row.stage2_gaps),
    stage2Rationale: row.stage2_rationale,
    bestResumeId: row.best_resume_id ? Number(row.best_resume_id) : null,
  };
}

export async function loadResumeForArtifact(
  bestResumeId: number | null,
): Promise<{ id: number; label: string; contentMd: string } | null> {
  // Prefer the best_resume_id chosen in Stage 2; fall back to whatever is
  // currently marked active so on-demand works even for older matches.
  const sql = bestResumeId
    ? `SELECT id, label, content_md FROM resumes WHERE id = $1 LIMIT 1`
    : `SELECT id, label, content_md FROM resumes
        WHERE length(trim(content_md)) > 0
        ORDER BY is_active DESC, updated_at DESC LIMIT 1`;
  const params = bestResumeId ? [bestResumeId] : [];
  const { rows } = await pool.query<{
    id: string;
    label: string;
    content_md: string;
  }>(sql, params);
  const r = rows[0];
  if (!r) return null;
  return { id: Number(r.id), label: r.label, contentMd: r.content_md };
}

export async function markManagersStatus(
  matchId: number,
  status: "queued" | "running" | "ready" | "error",
  opts: { error?: string | null; guesses?: unknown } = {},
): Promise<void> {
  await pool.query(
    `UPDATE job_matches
        SET managers_status    = $1,
            managers_error     = $2,
            hiring_manager_guesses = COALESCE($3::jsonb, hiring_manager_guesses),
            managers_updated_at = NOW()
      WHERE id = $4`,
    [
      status,
      opts.error ?? null,
      opts.guesses != null ? JSON.stringify(opts.guesses) : null,
      matchId,
    ],
  );
}

export async function saveTailorBinaries(
  matchId: number,
  bins: {
    resumeDocx: Buffer;
    resumePdf: Buffer;
    letterDocx: Buffer;
    letterPdf: Buffer;
  },
): Promise<void> {
  await pool.query(
    `UPDATE job_matches
        SET tailored_resume_docx = $1,
            tailored_resume_pdf  = $2,
            tailored_letter_docx = $3,
            tailored_letter_pdf  = $4,
            tailor_updated_at    = NOW()
      WHERE id = $5`,
    [
      bins.resumeDocx,
      bins.resumePdf,
      bins.letterDocx,
      bins.letterPdf,
      matchId,
    ],
  );
}

export async function markTailorStatus(
  matchId: number,
  status: "queued" | "running" | "ready" | "error",
  opts: {
    error?: string | null;
    resumeMd?: string | null;
    letterMd?: string | null;
  } = {},
): Promise<void> {
  await pool.query(
    `UPDATE job_matches
        SET tailor_status    = $1,
            tailor_error     = $2,
            tailored_resume_md = COALESCE($3, tailored_resume_md),
            tailored_letter_md = COALESCE($4, tailored_letter_md),
            tailor_updated_at = NOW()
      WHERE id = $5`,
    [
      status,
      opts.error ?? null,
      opts.resumeMd ?? null,
      opts.letterMd ?? null,
      matchId,
    ],
  );
}

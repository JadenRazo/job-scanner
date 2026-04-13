import { pool } from "./client.js";
import type { Profile } from "./profile.js";
import type { AtsKind } from "../scrapers/types.js";

export interface Stage1Row {
  jobId: number;
  companyId: number;
  companyName: string;
  ats: AtsKind;
  title: string;
  location: string | null;
  remote: boolean | null;
  url: string;
  descriptionMd: string | null;
  postedAt: Date | null;
}

/**
 * Fetch unscored raw_jobs that pass the Stage 1 free filter. All filtering
 * happens in SQL so we never load thousands of rejected rows into Node.
 *
 * Filter rules (all AND'd):
 *   - no existing job_matches row (LEFT JOIN NULL)
 *   - posted_at >= NOW() - 60 days (or NULL posted_at accepted)
 *   - title_allow empty OR title ILIKE ANY of allow
 *   - title_deny empty OR title !ILIKE ANY of deny
 *   - remote_only=false OR (remote=true OR location ILIKE '%remote%')
 *   - locations_allow empty OR location ILIKE ANY of allow
 *
 * Sort: newest first so the freshest JDs get scored even when a cap is applied.
 */
export async function fetchStage1Survivors(
  profile: Profile,
  limit: number,
): Promise<Stage1Row[]> {
  const sql = `
    SELECT
      r.id              AS job_id,
      r.company_id      AS company_id,
      c.name            AS company_name,
      r.ats             AS ats,
      r.title           AS title,
      r.location        AS location,
      r.remote          AS remote,
      r.url             AS url,
      r.description_md  AS description_md,
      r.posted_at       AS posted_at
    FROM raw_jobs r
    JOIN companies c ON c.id = r.company_id
    LEFT JOIN job_matches m ON m.job_id = r.id
    WHERE m.id IS NULL
      AND (r.posted_at IS NULL OR r.posted_at >= NOW() - interval '60 days')
      AND (
        cardinality($1::text[]) = 0
        OR EXISTS (
          SELECT 1 FROM unnest($1::text[]) AS a
           WHERE r.title ILIKE '%' || a || '%'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest($2::text[]) AS d
         WHERE cardinality($2::text[]) > 0
           AND r.title ILIKE '%' || d || '%'
      )
      AND (
        $3::boolean = FALSE
        OR COALESCE(r.remote, FALSE) = TRUE
        OR r.location ILIKE '%remote%'
      )
      AND (
        cardinality($4::text[]) = 0
        OR r.location IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest($4::text[]) AS l
           WHERE r.location ILIKE '%' || l || '%'
        )
      )
    ORDER BY COALESCE(r.posted_at, r.first_seen_at) DESC NULLS LAST
    LIMIT $5
  `;

  interface Row {
    job_id: string;
    company_id: string;
    company_name: string;
    ats: AtsKind;
    title: string;
    location: string | null;
    remote: boolean | null;
    url: string;
    description_md: string | null;
    posted_at: Date | null;
  }

  const { rows } = await pool.query<Row>(sql, [
    profile.titleAllow,
    profile.titleDeny,
    profile.remoteOnly,
    profile.locationsAllow,
    limit,
  ]);

  return rows.map((r) => ({
    jobId: Number(r.job_id),
    companyId: Number(r.company_id),
    companyName: r.company_name,
    ats: r.ats,
    title: r.title,
    location: r.location,
    remote: r.remote,
    url: r.url,
    descriptionMd: r.description_md,
    postedAt: r.posted_at,
  }));
}

export interface WriteStage2Input {
  jobId: number;
  stage1Pass: boolean;
  stage2Score: number;
  stage2Rationale: string;
  stage2Skills: string[];
  stage2Gaps: string[];
  bestResumeId: number | null;
}

export async function writeStage2Match(input: WriteStage2Input): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO job_matches (
       job_id, stage1_pass, stage2_score, stage2_rationale, stage2_skills,
       stage2_gaps, best_resume_id
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
     ON CONFLICT (job_id) DO UPDATE SET
       stage1_pass      = EXCLUDED.stage1_pass,
       stage2_score     = EXCLUDED.stage2_score,
       stage2_rationale = EXCLUDED.stage2_rationale,
       stage2_skills    = EXCLUDED.stage2_skills,
       stage2_gaps      = EXCLUDED.stage2_gaps,
       best_resume_id   = EXCLUDED.best_resume_id,
       updated_at       = NOW()
     RETURNING id`,
    [
      input.jobId,
      input.stage1Pass,
      input.stage2Score,
      input.stage2Rationale,
      JSON.stringify(input.stage2Skills),
      JSON.stringify(input.stage2Gaps),
      input.bestResumeId,
    ],
  );
  return Number(rows[0].id);
}

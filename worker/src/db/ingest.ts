import { pool } from "./client.js";
import type { ScrapedJob } from "../scrapers/types.js";
import { deriveCountry } from "../scrapers/country.js";

export interface IngestCounts {
  inserted: number;
  updated: number;
}

/**
 * Upsert a batch of ScrapedJobs into raw_jobs. Uses Postgres's `xmax = 0`
 * trick to detect which rows were new: on a fresh INSERT, the tuple's
 * xmax is 0; on an UPDATE, it's the transaction ID that modified it.
 *
 * Also derives `country` from `location + remote` when the scraper didn't
 * set one natively, and persists the aggregator's original employer name
 * in `source_company_name` when present.
 *
 * Runs inside a single transaction so either the whole batch lands or
 * nothing does — avoids partial state on interrupt.
 */
export async function ingestJobs(jobs: ScrapedJob[]): Promise<IngestCounts> {
  if (jobs.length === 0) return { inserted: 0, updated: 0 };

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query("BEGIN");

    for (const j of jobs) {
      const country = j.country ?? deriveCountry(j.location, j.remote ?? null);
      const sourceCompanyName = j.sourceCompanyName ?? null;

      const { rows } = await client.query<{ inserted: boolean }>(
        `INSERT INTO raw_jobs (
           company_id, ats, external_id, title, location, remote,
           seniority, posted_at, url, description_md, raw_json,
           country, source_company_name
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (ats, external_id) DO UPDATE SET
           title               = EXCLUDED.title,
           location            = EXCLUDED.location,
           remote              = EXCLUDED.remote,
           seniority           = EXCLUDED.seniority,
           posted_at           = EXCLUDED.posted_at,
           url                 = EXCLUDED.url,
           description_md      = EXCLUDED.description_md,
           raw_json            = EXCLUDED.raw_json,
           country             = EXCLUDED.country,
           source_company_name = EXCLUDED.source_company_name,
           last_seen_at        = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          j.companyId,
          j.ats,
          j.externalId,
          j.title,
          j.location,
          j.remote,
          j.seniority,
          j.postedAt,
          j.url,
          j.descriptionMd,
          j.raw ?? null,
          country,
          sourceCompanyName,
        ],
      );
      if (rows[0]?.inserted) inserted++;
      else updated++;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { inserted, updated };
}

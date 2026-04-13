import { pool } from "./client.js";

export async function startScrapeRun(companyId: number): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scrape_runs (company_id) VALUES ($1) RETURNING id`,
    [companyId],
  );
  return Number(rows[0].id);
}

export async function finishScrapeRun(
  runId: number,
  result: { ok: boolean; error?: string | null; found: number; newCount: number },
): Promise<void> {
  await pool.query(
    `UPDATE scrape_runs
        SET finished_at = NOW(),
            ok          = $2,
            error       = $3,
            found       = $4,
            new_count   = $5
      WHERE id = $1`,
    [runId, result.ok, result.error ?? null, result.found, result.newCount],
  );
}

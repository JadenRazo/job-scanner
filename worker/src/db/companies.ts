import { pool } from "./client.js";
import type { Company, AtsKind } from "../scrapers/types.js";

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  ats: AtsKind;
  slug: string;
  workday_site: string | null;
  enabled: boolean;
  tier: number;
}

function rowToCompany(r: CompanyRow): Company {
  return {
    id: Number(r.id),
    name: r.name,
    domain: r.domain,
    ats: r.ats,
    slug: r.slug,
    workdaySite: r.workday_site,
    enabled: r.enabled,
    tier: r.tier ?? 3,
  };
}

/**
 * Enabled companies ordered by:
 *   1. Whichever has gone longest without a scan (NULLS FIRST → untouched first)
 *   2. Tier (ascending — 1 is most important)
 *   3. id (stable)
 *
 * The scrape-worker serializes calls with 1-2s jitter, so ~500 companies
 * still fits in a ~15-minute pass.
 */
export async function listEnabledCompanies(): Promise<Company[]> {
  const { rows } = await pool.query<CompanyRow>(
    `SELECT id, name, domain, ats, slug, workday_site, enabled, tier
       FROM companies
      WHERE enabled = TRUE
      ORDER BY last_scanned_at NULLS FIRST, tier ASC, id ASC`,
  );
  return rows.map(rowToCompany);
}

/**
 * Enabled companies filtered to a set of tiers. Used by tier-aware
 * schedulers so Tier 1 can be scraped more often than Tier 6.
 */
export async function listEnabledCompaniesByTiers(
  tiers: number[],
): Promise<Company[]> {
  if (tiers.length === 0) return [];
  const { rows } = await pool.query<CompanyRow>(
    `SELECT id, name, domain, ats, slug, workday_site, enabled, tier
       FROM companies
      WHERE enabled = TRUE
        AND tier = ANY($1::smallint[])
      ORDER BY last_scanned_at NULLS FIRST, tier ASC, id ASC`,
    [tiers],
  );
  return rows.map(rowToCompany);
}

export async function markScanned(companyId: number): Promise<void> {
  await pool.query(`UPDATE companies SET last_scanned_at = NOW() WHERE id = $1`, [companyId]);
}

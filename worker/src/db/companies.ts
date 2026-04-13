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
  };
}

export async function listEnabledCompanies(): Promise<Company[]> {
  const { rows } = await pool.query<CompanyRow>(
    `SELECT id, name, domain, ats, slug, workday_site, enabled
       FROM companies
      WHERE enabled = TRUE
      ORDER BY last_scanned_at NULLS FIRST, id`,
  );
  return rows.map(rowToCompany);
}

export async function markScanned(companyId: number): Promise<void> {
  await pool.query(`UPDATE companies SET last_scanned_at = NOW() WHERE id = $1`, [companyId]);
}

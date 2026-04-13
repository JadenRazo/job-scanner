/** Supported ATS vendors — must match the CHECK constraint in db/schema.sql. */
export type AtsKind =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "smartrecruiters"
  | "jazzhr"
  | "bamboohr"
  | "icims";

/** A company row loaded from the DB, passed to scrapers. */
export interface Company {
  id: number;
  name: string;
  domain: string | null;
  ats: AtsKind;
  slug: string;
  workdaySite: string | null;
  enabled: boolean;
}

/**
 * Normalized shape emitted by every scraper. Field names are chosen to
 * match the `raw_jobs` table in db/schema.sql so ingest is a straight map.
 */
export interface ScrapedJob {
  ats: AtsKind;
  /** The ATS's native job identifier — stable across pulls for dedup. */
  externalId: string;
  companyId: number;
  title: string;
  location: string | null;
  remote: boolean | null;
  seniority: string | null;
  postedAt: Date | null;
  url: string;
  /** Plain-text JD body. May be stripped HTML. */
  descriptionMd: string | null;
  /** Original vendor payload for the job, kept verbatim. */
  raw: unknown;
}

export interface ScraperContext {
  company: Company;
  userAgent: string;
}

export type Scraper = (ctx: ScraperContext) => Promise<ScrapedJob[]>;

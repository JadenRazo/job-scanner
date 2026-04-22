/** Supported scrape sources — must match the ats CHECK constraint in db. */
export type AtsKind =
  // Standard ATS platforms with public board APIs
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "smartrecruiters"
  | "jazzhr"
  | "bamboohr"
  | "icims"
  // Big Tech custom careers APIs (one employer per dispatch)
  | "google"
  | "meta"
  | "amazon"
  | "apple"
  | "microsoft"
  // Aggregator sources (one synthetic company row per source;
  // actual employer name flows through ScrapedJob.sourceCompanyName)
  | "remoteok"
  | "remotive"
  | "yc_wafs"
  | "hn_hiring"
  | "simplifyjobs";

/** A company row loaded from the DB, passed to scrapers. */
export interface Company {
  id: number;
  name: string;
  domain: string | null;
  ats: AtsKind;
  slug: string;
  workdaySite: string | null;
  enabled: boolean;
  /** 1 = highest signal (Infra/DevTools). 7 = aggregator firehose. */
  tier: number;
}

/**
 * Normalized shape emitted by every scraper. Field names map onto columns
 * in `raw_jobs`; the ingest layer writes them + derives `country`.
 */
export interface ScrapedJob {
  ats: AtsKind;
  /** The source's native identifier — stable across pulls for dedup. */
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
  /**
   * For aggregator sources (RemoteOK, YC WAFS, HN hiring, SimplifyJobs,
   * Remotive): the actual employer name. Populated for aggregators only;
   * left undefined on direct-ATS pulls since `companies.name` already is
   * the employer.
   */
  sourceCompanyName?: string | null;
  /**
   * Optional ISO-2 country override — scrapers that know the country
   * natively set it here. Otherwise the ingest layer derives it from
   * `location` via heuristics.
   */
  country?: string | null;
}

export interface ScraperContext {
  company: Company;
  userAgent: string;
}

export type Scraper = (ctx: ScraperContext) => Promise<ScrapedJob[]>;

import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "meta" });

/**
 * Meta's careers site is a Next.js/GraphQL app that actively rate-limits
 * anonymous scrapers. We make a best-effort attempt against a small set of
 * public endpoints and return [] on failure rather than crashing the dispatch.
 *
 * Known shapes of a Meta job object (all optional because schema drifts):
 *   { id, title, locations: ["Menlo Park, CA"|"Remote, US"], ...}
 */
interface MetaJob {
  id?: string | number;
  title?: string | null;
  locations?: string[] | null;
  posted_date?: string | null;
  posted_at?: string | null;
  updated_at?: string | null;
  teams?: string[] | null;
  sub_teams?: string[] | null;
  job_description?: string | null;
  description?: string | null;
}

interface MetaListResponse {
  data?: {
    job_search?: {
      all_jobs?: MetaJob[];
      count?: number;
    };
  };
  jobs?: MetaJob[];
  results?: MetaJob[];
}

interface NextDataPayload {
  props?: {
    pageProps?: {
      initialJobs?: MetaJob[];
      jobs?: MetaJob[];
      searchResults?: { jobs?: MetaJob[] };
    };
  };
}

function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const decoded = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
  return decoded
    .split("\n")
    .map((line) => line.trim())
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n")
    .trim();
}

function parsePostedAt(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function detectRemote(locs: string[] | null | undefined): boolean {
  if (!locs || locs.length === 0) return false;
  return locs.some((l) => /remote/i.test(l));
}

function deriveCountry(locs: string[] | null | undefined): string | null {
  if (!locs || locs.length === 0) return null;
  const first = locs[0];
  if (/,\s*US\b|,\s*USA\b|United States/i.test(first)) return "US";
  if (/,\s*CA\b|,\s*CAN\b|Canada/i.test(first)) return "CA";
  return null;
}

async function tryUnofficialJobsApi(userAgent: string): Promise<MetaJob[] | null> {
  const url = "https://www.metacareers.com/api/jobs?q=software+engineer&page=1";
  try {
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "application/json",
      },
    });
    if (statusCode >= 400) {
      await body.text();
      return null;
    }
    const data = (await body.json()) as MetaListResponse;
    if (Array.isArray(data.jobs)) return data.jobs;
    if (Array.isArray(data.results)) return data.results;
    const gql = data.data?.job_search?.all_jobs;
    if (Array.isArray(gql)) return gql;
    return null;
  } catch {
    return null;
  }
}

async function tryNextDataExtraction(userAgent: string): Promise<MetaJob[] | null> {
  const url =
    "https://www.metacareers.com/v2/jobs?q=software%20engineer&offices[0]=REMOTE_US%20%26%20Canada";
  try {
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/json",
      },
    });
    if (statusCode >= 400) {
      await body.text();
      return null;
    }
    const html = await body.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;
    let parsed: NextDataPayload;
    try {
      parsed = JSON.parse(match[1]) as NextDataPayload;
    } catch {
      return null;
    }
    const pp = parsed.props?.pageProps;
    if (!pp) return null;
    if (Array.isArray(pp.initialJobs)) return pp.initialJobs;
    if (Array.isArray(pp.jobs)) return pp.jobs;
    if (Array.isArray(pp.searchResults?.jobs)) return pp.searchResults!.jobs!;
    return null;
  } catch {
    return null;
  }
}

export const metaScraper: Scraper = async ({ company, userAgent }) => {
  let raw = await tryUnofficialJobsApi(userAgent);
  let source: "api" | "nextdata" | "none" = raw ? "api" : "none";

  if (!raw || raw.length === 0) {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    const viaNext = await tryNextDataExtraction(userAgent);
    if (viaNext && viaNext.length > 0) {
      raw = viaNext;
      source = "nextdata";
    }
  }

  if (!raw || raw.length === 0) {
    log.warn({ slug: company.slug }, "meta: no public endpoint returned jobs; returning []");
    return [];
  }

  if (source === "nextdata") {
    log.warn({ slug: company.slug }, "meta: used __NEXT_DATA__ fallback");
  }

  const jobs: ScrapedJob[] = raw
    .filter((j): j is MetaJob & { id: string | number; title: string } => {
      return j !== null && j !== undefined && j.id !== undefined && typeof j.title === "string" && j.title.length > 0;
    })
    .map((j) => {
      const locs = j.locations ?? null;
      const location = locs && locs.length > 0 ? locs[0] : null;
      const description = j.job_description ?? j.description ?? null;
      return {
        ats: "meta",
        externalId: `meta-${String(j.id)}`,
        companyId: company.id,
        title: j.title,
        location,
        remote: detectRemote(locs),
        seniority: null,
        postedAt: parsePostedAt(j.posted_date ?? j.posted_at ?? j.updated_at ?? null),
        url: `https://www.metacareers.com/jobs/${j.id}/`,
        descriptionMd: htmlToText(description) ?? "",
        raw: j,
        country: deriveCountry(locs),
      };
    });

  log.info({ slug: company.slug, count: jobs.length, source }, "meta fetch ok");
  return jobs;
};

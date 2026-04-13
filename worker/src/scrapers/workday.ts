import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "workday" });

interface WorkdayPosting {
  title: string;
  externalPath: string;
  locationsText?: string | null;
  postedOn?: string | null;
  bulletFields?: unknown;
  jobFamily?: string | null;
  jobRequisitionId?: string | null;
}

interface WorkdayResponse {
  total?: number;
  jobPostings?: WorkdayPosting[];
}

type Pod = "wd5" | "wd1";

const PAGE_SIZE = 20;
const MAX_OFFSET = 400;

function detectRemote(locationName: string | null | undefined): boolean | null {
  if (!locationName) return null;
  return /remote|anywhere|work[-\s]?from[-\s]?home/i.test(locationName);
}

/**
 * Best-effort parse of Workday's human-readable `postedOn` strings:
 *   "Posted Today"       -> now
 *   "Posted Yesterday"   -> now - 1d
 *   "Posted 3 Days Ago"  -> now - 3d
 *   "Posted 30+ Days Ago"-> now - 30d
 * Returns null if the shape is unrecognized.
 */
function parsePostedOn(s: string | null | undefined): Date | null {
  if (!s) return null;
  const str = s.trim().toLowerCase();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (/posted\s+today/.test(str)) return new Date(now);
  if (/posted\s+yesterday/.test(str)) return new Date(now - day);
  const m = str.match(/posted\s+(\d+)\+?\s*days?\s*ago/);
  if (m) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n)) return new Date(now - n * day);
  }
  return null;
}

async function fetchPage(
  pod: Pod,
  tenant: string,
  site: string,
  offset: number,
  userAgent: string,
): Promise<{ statusCode: number; data: WorkdayResponse | null; errText?: string }> {
  const url = `https://${tenant}.${pod}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  try {
    const { statusCode, body } = await request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": userAgent,
        accept: "application/json",
      },
      body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: "" }),
    });
    if (statusCode >= 400) {
      const text = await body.text();
      return { statusCode, data: null, errText: text.slice(0, 200) };
    }
    const data = (await body.json()) as WorkdayResponse;
    return { statusCode, data };
  } catch (err) {
    return { statusCode: 0, data: null, errText: (err as Error).message };
  }
}

export const workdayScraper: Scraper = async ({ company, userAgent }) => {
  if (!company.workdaySite) {
    throw new Error(`workday ${company.slug}: workdaySite is required but was null`);
  }
  const tenant = company.slug;
  const site = company.workdaySite;

  // Probe pods: try wd5 first, fall back to wd1 on 404 or connect error.
  let pod: Pod = "wd5";
  let first = await fetchPage(pod, tenant, site, 0, userAgent);
  if (first.statusCode === 404 || first.statusCode === 0) {
    log.warn({ slug: tenant, site, pod, err: first.errText }, "workday wd5 failed, trying wd1");
    pod = "wd1";
    first = await fetchPage(pod, tenant, site, 0, userAgent);
  }

  if (first.statusCode === 404 || first.statusCode === 0) {
    log.warn({ slug: tenant, site }, "workday board not reachable on wd5 or wd1");
    return [];
  }
  if (first.statusCode >= 400) {
    throw new Error(`workday ${tenant}/${site} returned ${first.statusCode}: ${first.errText ?? ""}`);
  }
  if (!first.data || !Array.isArray(first.data.jobPostings)) {
    log.warn({ slug: tenant, site, pod }, "workday returned no jobPostings");
    return [];
  }

  log.info({ slug: tenant, site, pod, total: first.data.total }, "workday pod ok");

  const postings: WorkdayPosting[] = [];
  postings.push(...first.data.jobPostings);
  const total = typeof first.data.total === "number" ? first.data.total : Number.POSITIVE_INFINITY;

  let offset = PAGE_SIZE;
  while (offset <= MAX_OFFSET && offset < total) {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
    const page = await fetchPage(pod, tenant, site, offset, userAgent);
    if (page.statusCode >= 400 || page.statusCode === 0) {
      log.warn({ slug: tenant, site, pod, offset, status: page.statusCode }, "workday page failed, stopping");
      break;
    }
    if (!page.data || !Array.isArray(page.data.jobPostings) || page.data.jobPostings.length === 0) {
      break;
    }
    postings.push(...page.data.jobPostings);
    offset += PAGE_SIZE;
  }

  const jobs: ScrapedJob[] = postings.map((p) => {
    const loc = p.locationsText ?? null;
    const externalId = p.jobRequisitionId ?? p.externalPath;
    return {
      ats: "workday",
      externalId,
      companyId: company.id,
      title: p.title,
      location: loc,
      remote: detectRemote(loc),
      seniority: null,
      postedAt: parsePostedOn(p.postedOn ?? null),
      url: `https://${tenant}.${pod}.myworkdayjobs.com/en-US/${site}${p.externalPath}`,
      descriptionMd: "",
      raw: p,
    };
  });

  log.info({ slug: tenant, site, pod, count: jobs.length, total: first.data.total }, "workday fetch ok");
  return jobs;
};

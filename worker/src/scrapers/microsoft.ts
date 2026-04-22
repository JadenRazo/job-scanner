import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "microsoft" });

const PAGE_SIZE = 20;
const MAX_PAGES = 50;
const MAX_JOBS = 2000;

interface MicrosoftJobProperties {
  locations?: string[] | null;
  primaryLocation?: string | null;
  country?: string | null;
  city?: string | null;
  description?: string | null;
  jobSummary?: string | null;
  category?: string | null;
  profession?: string | null;
  discipline?: string | null;
  employmentType?: string | null;
  workSiteFlexibility?: string | null;
  education?: string | null;
  experience?: string | null;
  postedDate?: string | null;
  datePublished?: string | null;
}

interface MicrosoftJob {
  jobId: string | number;
  title?: string | null;
  postingTitle?: string | null;
  properties?: MicrosoftJobProperties | null;
}

interface MicrosoftResult {
  jobs?: MicrosoftJob[];
  totalJobs?: number;
}

interface MicrosoftOperationResult {
  result?: MicrosoftResult;
}

interface MicrosoftResponse {
  operationResult?: MicrosoftOperationResult;
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

function parsePostedAt(...candidates: Array<string | null | undefined>): Date | null {
  for (const s of candidates) {
    if (!s) continue;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  if (up === "UNITED STATES" || up === "US" || up === "USA") return "US";
  if (up === "CANADA" || up === "CA" || up === "CAN") return "CA";
  return null;
}

function detectRemote(
  flex: string | null | undefined,
  title: string | null,
  location: string | null,
): boolean {
  if (flex && /remote/i.test(flex)) return true;
  const hay = `${title ?? ""} ${location ?? ""}`;
  return /\bremote\b|work[-\s]?from[-\s]?home/i.test(hay);
}

async function fetchPage(
  page: number,
  userAgent: string,
): Promise<{ statusCode: number; data: MicrosoftResponse | null; errText?: string }> {
  const url =
    "https://gcsservices.careers.microsoft.com/search/api/v1/search" +
    `?q=${encodeURIComponent("software engineer")}` +
    `&lc=${encodeURIComponent("United States")}&lc=${encodeURIComponent("Canada")}` +
    `&l=en_us&pg=${page}&pgSz=${PAGE_SIZE}&o=Recent&flt=true`;
  try {
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "application/json",
      },
    });
    if (statusCode === 404) {
      await body.text();
      return { statusCode, data: null };
    }
    if (statusCode >= 400) {
      const text = await body.text();
      return { statusCode, data: null, errText: text.slice(0, 200) };
    }
    const data = (await body.json()) as MicrosoftResponse;
    return { statusCode, data };
  } catch (err) {
    return { statusCode: 0, data: null, errText: (err as Error).message };
  }
}

export const microsoftScraper: Scraper = async ({ company, userAgent }) => {
  const collected: MicrosoftJob[] = [];
  let total: number | undefined;

  const first = await fetchPage(1, userAgent);
  if (first.statusCode === 404) {
    log.warn({ slug: company.slug }, "microsoft search 404");
    return [];
  }
  if (first.statusCode === 0 || first.statusCode >= 400) {
    throw new Error(`microsoft returned ${first.statusCode}: ${first.errText ?? ""}`);
  }
  const firstResult = first.data?.operationResult?.result;
  if (!firstResult || !Array.isArray(firstResult.jobs)) {
    log.warn({ slug: company.slug }, "microsoft returned unexpected payload");
    return [];
  }

  collected.push(...firstResult.jobs);
  if (typeof firstResult.totalJobs === "number") total = firstResult.totalJobs;

  for (let page = 2; page <= MAX_PAGES; page++) {
    if (collected.length >= MAX_JOBS) break;
    if (typeof total === "number" && collected.length >= total) break;
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    const res = await fetchPage(page, userAgent);
    if (res.statusCode === 0 || res.statusCode >= 400) {
      log.warn(
        { slug: company.slug, page, status: res.statusCode, err: res.errText },
        "microsoft page failed, stopping",
      );
      break;
    }
    const result = res.data?.operationResult?.result;
    if (!result || !Array.isArray(result.jobs) || result.jobs.length === 0) break;
    collected.push(...result.jobs);
  }

  const trimmed = collected.slice(0, MAX_JOBS);

  const jobs: ScrapedJob[] = trimmed
    .filter((j): j is MicrosoftJob => j !== null && j !== undefined && j.jobId !== undefined && j.jobId !== null)
    .map((j) => {
      const props = j.properties ?? null;
      const location =
        (props?.primaryLocation && props.primaryLocation.length > 0 && props.primaryLocation) ||
        (props?.locations && props.locations.length > 0 ? props.locations[0] : null) ||
        null;
      const title = (j.postingTitle && j.postingTitle.length > 0 ? j.postingTitle : j.title) ?? "";
      const country = normalizeCountry(props?.country ?? null);
      const descRaw = props?.description ?? props?.jobSummary ?? null;
      return {
        ats: "microsoft",
        externalId: String(j.jobId),
        companyId: company.id,
        title,
        location,
        remote: detectRemote(props?.workSiteFlexibility ?? null, title, location),
        seniority: typeof props?.experience === "string" && props.experience.length > 0 ? props.experience : null,
        postedAt: parsePostedAt(props?.postedDate, props?.datePublished),
        url: `https://jobs.careers.microsoft.com/us/en/job/${String(j.jobId)}`,
        descriptionMd: htmlToText(descRaw) ?? "",
        raw: j,
        country,
      };
    });

  log.info({ slug: company.slug, count: jobs.length, total }, "microsoft fetch ok");
  return jobs;
};

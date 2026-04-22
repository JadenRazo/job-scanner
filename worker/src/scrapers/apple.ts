import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "apple" });

const MAX_PAGES = 30;
const MAX_JOBS = 600;

interface AppleLocation {
  name?: string | null;
  country?: string | null;
  countryCode?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
}

interface AppleTeam {
  teamCode?: string | null;
  teamName?: string | null;
}

interface AppleJob {
  id?: string | number | null;
  positionId?: string | number | null;
  postingTitle?: string | null;
  postingBusinessTitle?: string | null;
  postingDate?: string | null;
  standardWeeklyHours?: number | null;
  locations?: AppleLocation[] | null;
  managedPipelineRole?: unknown;
  team?: AppleTeam | null;
}

interface AppleResponse {
  totalRecords?: number;
  searchResults?: AppleJob[];
}

function parsePostedAt(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  if (up === "US" || up === "USA" || up === "UNITED STATES") return "US";
  if (up === "CA" || up === "CAN" || up === "CANADA") return "CA";
  return null;
}

function detectRemote(title: string | null | undefined, location: string | null): boolean {
  const hay = `${title ?? ""} ${location ?? ""}`;
  return /\bremote\b|work[-\s]?from[-\s]?home/i.test(hay);
}

async function fetchPage(
  page: number,
  userAgent: string,
): Promise<{ statusCode: number; data: AppleResponse | null; errText?: string }> {
  const url =
    "https://jobs.apple.com/api/role/search" +
    `?search=${encodeURIComponent("software engineer")}&locale=en-us&page=${page}&sort=newest`;
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
    const data = (await body.json()) as AppleResponse;
    return { statusCode, data };
  } catch (err) {
    return { statusCode: 0, data: null, errText: (err as Error).message };
  }
}

export const appleScraper: Scraper = async ({ company, userAgent }) => {
  const collected: AppleJob[] = [];
  let total: number | undefined;

  const first = await fetchPage(1, userAgent);
  if (first.statusCode === 404) {
    log.warn({ slug: company.slug }, "apple search 404");
    return [];
  }
  if (first.statusCode === 0 || first.statusCode >= 400) {
    throw new Error(`apple returned ${first.statusCode}: ${first.errText ?? ""}`);
  }
  if (!first.data || !Array.isArray(first.data.searchResults)) {
    log.warn({ slug: company.slug }, "apple returned no searchResults");
    return [];
  }

  collected.push(...first.data.searchResults);
  if (typeof first.data.totalRecords === "number") total = first.data.totalRecords;

  for (let page = 2; page <= MAX_PAGES; page++) {
    if (collected.length >= MAX_JOBS) break;
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    const res = await fetchPage(page, userAgent);
    if (res.statusCode === 0 || res.statusCode >= 400) {
      log.warn(
        { slug: company.slug, page, status: res.statusCode, err: res.errText },
        "apple page failed, stopping",
      );
      break;
    }
    if (!res.data || !Array.isArray(res.data.searchResults) || res.data.searchResults.length === 0) break;
    collected.push(...res.data.searchResults);
  }

  const trimmed = collected.slice(0, MAX_JOBS);

  const jobs: ScrapedJob[] = trimmed
    .filter((j): j is AppleJob => {
      const hasId = j.positionId !== undefined && j.positionId !== null;
      const hasTitle = typeof j.postingTitle === "string" || typeof j.postingBusinessTitle === "string";
      return hasId && hasTitle;
    })
    .map((j) => {
      const firstLoc = j.locations && j.locations.length > 0 ? j.locations[0] : null;
      const location = firstLoc?.name ?? null;
      const country = normalizeCountry(firstLoc?.countryCode ?? firstLoc?.country ?? null);
      const title = j.postingBusinessTitle && j.postingBusinessTitle.length > 0
        ? j.postingBusinessTitle
        : (j.postingTitle ?? "");
      return {
        ats: "apple",
        externalId: String(j.positionId ?? j.id ?? ""),
        companyId: company.id,
        title,
        location,
        remote: detectRemote(title, location),
        seniority: null,
        postedAt: parsePostedAt(j.postingDate ?? null),
        url: `https://jobs.apple.com/en-us/details/${String(j.positionId ?? j.id ?? "")}`,
        descriptionMd: "",
        raw: j,
        country,
      };
    });

  log.info({ slug: company.slug, count: jobs.length, total }, "apple fetch ok");
  return jobs;
};

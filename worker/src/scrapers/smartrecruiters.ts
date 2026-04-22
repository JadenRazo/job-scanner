import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "smartrecruiters" });

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

interface SRLocation {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  remote?: boolean | null;
}

interface SRPosting {
  id: string;
  name: string;
  uuid?: string;
  jobAdUrl?: string | null;
  applyUrl?: string | null;
  refNumber?: string | null;
  company?: { name?: string | null } | null;
  location?: SRLocation | null;
  releasedDate?: string | null;
  industry?: unknown;
  department?: unknown;
  function?: unknown;
  typeOfEmployment?: unknown;
  experienceLevel?: unknown;
  creator?: unknown;
  jobAd?: {
    sections?: {
      jobDescription?: { text?: string | null } | null;
    } | null;
  } | null;
}

interface SRResponse {
  totalFound?: number;
  content?: SRPosting[];
}

function parsePostedAt(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildLocation(loc: SRLocation | null | undefined): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.region, loc.country]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function detectRemote(loc: SRLocation | null | undefined, locationStr: string | null): boolean | null {
  if (loc?.remote === true) return true;
  if (!locationStr) return null;
  return /remote|anywhere|work[-\s]?from[-\s]?home/i.test(locationStr);
}

export const smartrecruitersScraper: Scraper = async ({ company, userAgent }) => {
  const companyId = company.slug;
  const postings: SRPosting[] = [];
  let totalFound: number | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?limit=${PAGE_SIZE}&offset=${offset}`;

    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "application/json",
      },
    });

    if (statusCode === 404) {
      log.warn({ slug: companyId }, "board not found (404)");
      return [];
    }
    if (statusCode >= 400) {
      const text = await body.text();
      throw new Error(`smartrecruiters ${companyId} returned ${statusCode}: ${text.slice(0, 200)}`);
    }

    const data = (await body.json()) as SRResponse;
    if (!data || !Array.isArray(data.content)) {
      throw new Error(`smartrecruiters ${companyId} returned unexpected payload`);
    }

    if (typeof data.totalFound === "number") totalFound = data.totalFound;

    if (data.content.length === 0) break;
    postings.push(...data.content);

    if (typeof totalFound === "number" && postings.length >= totalFound) break;
    if (data.content.length < PAGE_SIZE) break;

    await new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
  }

  const jobs: ScrapedJob[] = postings.map((p) => {
    const locationStr = buildLocation(p.location ?? null);
    const fallbackUrl = `https://jobs.smartrecruiters.com/${companyId}/${p.id}`;
    const url = p.jobAdUrl ?? p.applyUrl ?? fallbackUrl;
    return {
      ats: "smartrecruiters",
      externalId: String(p.id),
      companyId: company.id,
      title: p.name,
      location: locationStr,
      remote: detectRemote(p.location ?? null, locationStr),
      seniority: null,
      postedAt: parsePostedAt(p.releasedDate ?? null),
      url,
      descriptionMd: "",
      raw: p,
    };
  });

  log.info({ slug: companyId, count: jobs.length, total: totalFound }, "smartrecruiters fetch ok");
  return jobs;
};

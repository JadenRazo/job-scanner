import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "google" });

const MAX_PAGES = 20;
const MAX_JOBS = 500;

interface GoogleLocation {
  city?: string | null;
  state?: string | null;
  state_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface GoogleJob {
  job_id: string | number;
  title: string;
  description?: string | null;
  responsibilities?: string | null;
  qualifications?: string | null;
  locations?: GoogleLocation[];
  job_level?: string | null;
  apply_url?: string | null;
  view_url?: string | null;
  application_url?: string | null;
  posted_date?: string | null;
  categories?: unknown;
  companies?: Array<{ display_name?: string | null }>;
}

interface GoogleResponse {
  jobs?: GoogleJob[];
  total_count?: number;
  next?: unknown;
  count?: number;
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

function buildLocation(loc: GoogleLocation | undefined): string | null {
  if (!loc) return null;
  const city = typeof loc.city === "string" ? loc.city.trim() : "";
  const region =
    (typeof loc.state_code === "string" && loc.state_code.trim()) ||
    (typeof loc.state === "string" && loc.state.trim()) ||
    (typeof loc.country_code === "string" && loc.country_code.trim()) ||
    (typeof loc.country === "string" && loc.country.trim()) ||
    "";
  const parts = [city, region].filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function detectRemote(title: string | null | undefined, location: string | null): boolean {
  const hay = `${title ?? ""} ${location ?? ""}`;
  return /remote|anywhere|work[-\s]?from[-\s]?home/i.test(hay);
}

async function fetchPrimaryPage(
  page: number,
  userAgent: string,
): Promise<{ statusCode: number; data: GoogleResponse | null; errText?: string }> {
  const url =
    "https://careers.google.com/api/v3/search/" +
    `?distance=50&employment_type=FULL_TIME&employment_type=INTERN&hl=en_US&jlo=en_US` +
    `&location=${encodeURIComponent("United States")}&location=${encodeURIComponent("Canada")}` +
    `&page=${page}&sort_by=relevance&q=${encodeURIComponent("software engineer")}`;
  try {
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "application/json",
      },
    });
    if (statusCode >= 400) {
      const text = await body.text();
      return { statusCode, data: null, errText: text.slice(0, 200) };
    }
    const data = (await body.json()) as GoogleResponse;
    return { statusCode, data };
  } catch (err) {
    return { statusCode: 0, data: null, errText: (err as Error).message };
  }
}

async function fetchFallbackPage(
  page: number,
  userAgent: string,
): Promise<{ statusCode: number; data: GoogleResponse | null; errText?: string }> {
  // Public site JSON endpoint fallback — schema overlaps sufficiently with the v3 API.
  const url =
    "https://www.google.com/about/careers/applications/jobs/results/" +
    `?page=${page}&q=${encodeURIComponent("software engineer")}` +
    `&location=${encodeURIComponent("United States")}&location=${encodeURIComponent("Canada")}`;
  try {
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "application/json",
      },
    });
    if (statusCode >= 400) {
      const text = await body.text();
      return { statusCode, data: null, errText: text.slice(0, 200) };
    }
    // The public page often returns HTML, not JSON. Guard the parse.
    const raw = await body.text();
    try {
      const data = JSON.parse(raw) as GoogleResponse;
      return { statusCode, data };
    } catch {
      return { statusCode: 0, data: null, errText: "fallback returned non-JSON" };
    }
  } catch (err) {
    return { statusCode: 0, data: null, errText: (err as Error).message };
  }
}

export const googleScraper: Scraper = async ({ company, userAgent }) => {
  const collected: GoogleJob[] = [];
  let total: number | undefined;
  let usedFallback = false;

  // Probe the primary endpoint first.
  let first = await fetchPrimaryPage(1, userAgent);
  if (first.statusCode === 0 || first.statusCode >= 400 || !first.data || !Array.isArray(first.data.jobs)) {
    log.warn(
      { slug: company.slug, status: first.statusCode, err: first.errText },
      "google primary endpoint failed, trying fallback",
    );
    usedFallback = true;
    first = await fetchFallbackPage(1, userAgent);
  }

  if (first.statusCode === 0 || first.statusCode >= 400 || !first.data || !Array.isArray(first.data.jobs)) {
    log.warn({ slug: company.slug, status: first.statusCode, err: first.errText }, "google all endpoints failed");
    return [];
  }

  collected.push(...first.data.jobs);
  if (typeof first.data.total_count === "number") total = first.data.total_count;

  const fetchPage = usedFallback ? fetchFallbackPage : fetchPrimaryPage;

  for (let page = 2; page <= MAX_PAGES; page++) {
    if (collected.length >= MAX_JOBS) break;
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    const res = await fetchPage(page, userAgent);
    if (res.statusCode === 0 || res.statusCode >= 400) {
      log.warn({ slug: company.slug, page, status: res.statusCode, err: res.errText }, "google page failed, stopping");
      break;
    }
    if (!res.data || !Array.isArray(res.data.jobs) || res.data.jobs.length === 0) break;
    collected.push(...res.data.jobs);
  }

  const trimmed = collected.slice(0, MAX_JOBS);

  const jobs: ScrapedJob[] = trimmed.map((j) => {
    const firstLoc = j.locations && j.locations.length > 0 ? j.locations[0] : undefined;
    const location = buildLocation(firstLoc);
    const countryCode =
      firstLoc && typeof firstLoc.country_code === "string" && firstLoc.country_code.trim().length > 0
        ? firstLoc.country_code.trim().toUpperCase()
        : null;
    const descCombined = [j.description, j.responsibilities, j.qualifications]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("\n\n");
    const applyUrl =
      (typeof j.apply_url === "string" && j.apply_url.length > 0 && j.apply_url) ||
      (typeof j.application_url === "string" && j.application_url.length > 0 && j.application_url) ||
      (typeof j.view_url === "string" && j.view_url.length > 0 && j.view_url) ||
      `https://www.google.com/about/careers/applications/jobs/results/${j.job_id}`;

    return {
      ats: "google",
      externalId: String(j.job_id),
      companyId: company.id,
      title: j.title,
      location,
      remote: detectRemote(j.title, location),
      seniority: typeof j.job_level === "string" && j.job_level.length > 0 ? j.job_level : null,
      postedAt: parsePostedAt(j.posted_date ?? null),
      url: applyUrl,
      descriptionMd: htmlToText(descCombined) ?? "",
      raw: j,
      country: countryCode,
    };
  });

  log.info(
    { slug: company.slug, count: jobs.length, total, fallback: usedFallback },
    "google fetch ok",
  );
  return jobs;
};

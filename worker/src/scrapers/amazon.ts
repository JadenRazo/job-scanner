import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "amazon" });

const PAGE_SIZE = 100;
const MAX_JOBS = 2000;
const MAX_PAGES_PER_CATEGORY = 20;

const CATEGORIES = ["software-development", "solutions-architect"] as const;

interface AmazonJob {
  id?: string | number | null;
  id_icims?: string | number | null;
  title: string;
  description?: string | null;
  basic_qualifications?: string | null;
  preferred_qualifications?: string | null;
  responsibilities?: string | null;
  business_category?: string | null;
  job_category?: string | null;
  posted_date?: string | null;
  updated_time?: string | null;
  url_next_step?: string | null;
  job_path?: string | null;
  location?: string | null;
  country_code?: string | null;
  normalized_location?: string | null;
  team?: string | null;
}

interface AmazonResponse {
  hits?: number;
  jobs?: AmazonJob[];
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

/**
 * Amazon's `posted_date` is typically a long-form English date like
 * "May 12, 2024" or "April 3, 2025". `new Date()` accepts these on V8,
 * but we fall back to ISO strings too.
 */
function parsePostedAt(...candidates: Array<string | null | undefined>): Date | null {
  for (const s of candidates) {
    if (!s) continue;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function normalizeCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const up = code.trim().toUpperCase();
  if (up === "US" || up === "USA") return "US";
  if (up === "CA" || up === "CAN") return "CA";
  return null;
}

function detectRemote(title: string, location: string | null): boolean {
  const hay = `${title} ${location ?? ""}`;
  return /\bremote\b|virtual|work[-\s]?from[-\s]?home/i.test(hay);
}

async function fetchPage(
  category: string,
  offset: number,
  userAgent: string,
): Promise<{ statusCode: number; data: AmazonResponse | null; errText?: string }> {
  const url =
    "https://www.amazon.jobs/en/search.json" +
    `?normalized_country_code%5B%5D=USA&normalized_country_code%5B%5D=CAN` +
    `&category%5B%5D=${encodeURIComponent(category)}` +
    `&radius=24km&result_limit=${PAGE_SIZE}&offset=${offset}&sort=recent`;
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
    const data = (await body.json()) as AmazonResponse;
    return { statusCode, data };
  } catch (err) {
    return { statusCode: 0, data: null, errText: (err as Error).message };
  }
}

export const amazonScraper: Scraper = async ({ company, userAgent }) => {
  const seen = new Map<string, AmazonJob>();
  let totalHits: number | undefined;

  for (const category of CATEGORIES) {
    if (seen.size >= MAX_JOBS) break;
    for (let page = 0; page < MAX_PAGES_PER_CATEGORY; page++) {
      if (seen.size >= MAX_JOBS) break;
      const offset = page * PAGE_SIZE;
      const res = await fetchPage(category, offset, userAgent);

      if (res.statusCode === 404) {
        log.warn({ slug: company.slug, category }, "amazon search.json 404, skipping category");
        break;
      }
      if (res.statusCode === 0 || res.statusCode >= 400) {
        // Throw only on the very first page of the first category — otherwise
        // treat as end-of-stream and move on. This mirrors workday.ts's
        // "break on page failure" pattern once we've already made progress.
        if (category === CATEGORIES[0] && page === 0 && seen.size === 0) {
          throw new Error(
            `amazon ${category} returned ${res.statusCode}: ${res.errText ?? ""}`,
          );
        }
        log.warn(
          { slug: company.slug, category, page, status: res.statusCode, err: res.errText },
          "amazon page failed, stopping category",
        );
        break;
      }
      if (!res.data || !Array.isArray(res.data.jobs)) break;
      if (typeof res.data.hits === "number") totalHits = res.data.hits;

      const batch = res.data.jobs;
      if (batch.length === 0) break;

      for (const j of batch) {
        const key = String(j.id_icims ?? j.id ?? "");
        if (key.length === 0) continue;
        if (!seen.has(key)) seen.set(key, j);
        if (seen.size >= MAX_JOBS) break;
      }

      if (batch.length < PAGE_SIZE) break;
      if (typeof res.data.hits === "number" && offset + PAGE_SIZE >= res.data.hits) break;

      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    }
  }

  const jobs: ScrapedJob[] = Array.from(seen.values()).map((j) => {
    const location = j.normalized_location ?? j.location ?? null;
    const country = normalizeCountry(j.country_code ?? null);
    const descCombined = [j.description, j.responsibilities, j.basic_qualifications]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("\n\n");
    const url = j.job_path
      ? `https://www.amazon.jobs${j.job_path}`
      : `https://www.amazon.jobs/en/jobs/${String(j.id_icims ?? j.id ?? "")}`;
    return {
      ats: "amazon",
      externalId: String(j.id_icims ?? j.id ?? ""),
      companyId: company.id,
      title: j.title,
      location,
      remote: detectRemote(j.title, location),
      seniority: null,
      postedAt: parsePostedAt(j.posted_date, j.updated_time),
      url,
      descriptionMd: htmlToText(descCombined) ?? "",
      raw: j,
      country,
    };
  });

  log.info({ slug: company.slug, count: jobs.length, totalHits }, "amazon fetch ok");
  return jobs;
};

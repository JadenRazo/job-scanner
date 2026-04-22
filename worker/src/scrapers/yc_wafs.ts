import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "yc_wafs" });

/**
 * YC's Work at a Startup listings. No official public API. We try an
 * unofficial JSON endpoint first, then fall back to parsing the Next.js
 * data blob from the HTML listing page. If both fail, return [] — this
 * source is known to be flaky.
 */
interface WafsCompany {
  id?: number | string;
  name?: string;
  slug?: string;
  website?: string;
  batch?: string;
}

interface WafsJob {
  id?: number | string;
  title?: string;
  role_category?: string;
  job_type?: string;
  locations?: string[];
  company?: WafsCompany;
  salary_range?: string;
  description?: string;
  created_at?: string;
  apply_url?: string;
}

interface WafsApiResponse {
  jobs?: WafsJob[];
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

function parsePostedAt(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function detectRemote(locations: string[] | undefined): boolean {
  if (!locations || locations.length === 0) return true; // absent locations → treat as remote-friendly
  return locations.some((l) => /remote|anywhere|worldwide|wfh/i.test(l));
}

/**
 * Depth-first walk over an arbitrary JSON blob looking for arrays of
 * objects that look like WAFS job records. Used when we fall back to
 * parsing the Next.js data blob.
 */
function findJobsInBlob(node: unknown): WafsJob[] {
  const results: WafsJob[] = [];
  const stack: unknown[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      // Heuristic: treat as a job list if the first element has id+title+company-ish fields
      const first = cur[0] as Record<string, unknown> | undefined;
      if (
        first &&
        typeof first === "object" &&
        ("title" in first) &&
        ("id" in first) &&
        ("company" in first || "company_name" in first)
      ) {
        for (const item of cur) {
          if (item && typeof item === "object") results.push(item as WafsJob);
        }
        continue;
      }
      for (const item of cur) stack.push(item);
    } else if (typeof cur === "object") {
      for (const v of Object.values(cur as Record<string, unknown>)) stack.push(v);
    }
  }
  return results;
}

async function fetchViaApi(userAgent: string): Promise<WafsJob[] | null> {
  const url = "https://www.workatastartup.com/api/v1/jobs?remote=true";
  try {
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "application/json",
      },
    });

    if (statusCode === 403 || statusCode === 404 || statusCode >= 500) {
      log.warn({ source: "yc_wafs", statusCode }, "api unavailable; will try html fallback");
      return null;
    }
    if (statusCode >= 400) {
      log.warn({ source: "yc_wafs", statusCode }, "api returned non-2xx; will try html fallback");
      return null;
    }

    const data = (await body.json()) as WafsApiResponse | WafsJob[];
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.jobs)) return data.jobs;
    return null;
  } catch (err) {
    log.warn({ source: "yc_wafs", err: (err as Error).message }, "api fetch threw; will try html fallback");
    return null;
  }
}

async function fetchViaHtml(userAgent: string): Promise<WafsJob[] | null> {
  const url = "https://www.workatastartup.com/jobs";
  try {
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (statusCode >= 400) {
      log.warn({ source: "yc_wafs", statusCode }, "html page returned non-2xx");
      return null;
    }

    const html = await body.text();
    const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      log.warn({ source: "yc_wafs" }, "no __NEXT_DATA__ blob in html");
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      log.warn({ source: "yc_wafs" }, "failed to parse __NEXT_DATA__ json");
      return null;
    }
    const jobs = findJobsInBlob(parsed);
    return jobs.length > 0 ? jobs : null;
  } catch (err) {
    log.warn({ source: "yc_wafs", err: (err as Error).message }, "html fallback fetch threw");
    return null;
  }
}

export const ycWafsScraper: Scraper = async ({ company, userAgent }) => {
  let raw: WafsJob[] | null = await fetchViaApi(userAgent);
  let via: "api" | "html" = "api";
  if (!raw || raw.length === 0) {
    raw = await fetchViaHtml(userAgent);
    via = "html";
  }

  if (!raw || raw.length === 0) {
    log.warn({ source: "yc_wafs" }, "both api and html paths empty; returning []");
    return [];
  }

  const jobs: ScrapedJob[] = raw
    .filter((j) => j && j.id !== undefined && j.id !== null && typeof j.title === "string" && j.title.length > 0)
    .map((j) => {
      const locations = Array.isArray(j.locations) ? j.locations.filter((l) => typeof l === "string") : [];
      const location = locations.length > 0 ? locations.join(", ") : null;
      const remote = detectRemote(locations);
      const url =
        j.apply_url && j.apply_url.length > 0
          ? j.apply_url
          : `https://www.workatastartup.com/jobs/${j.id}`;
      return {
        ats: "yc_wafs",
        externalId: `yc-${String(j.id)}`,
        companyId: company.id,
        title: j.title as string,
        location,
        remote,
        seniority: j.job_type && j.job_type.length > 0 ? j.job_type : null,
        postedAt: parsePostedAt(j.created_at),
        url,
        descriptionMd: htmlToText(j.description) ?? "",
        raw: j,
        sourceCompanyName: j.company?.name ?? "Unknown YC Company",
      };
    });

  log.info({ source: "yc_wafs", via, count: jobs.length }, "yc_wafs fetch ok");
  return jobs;
};

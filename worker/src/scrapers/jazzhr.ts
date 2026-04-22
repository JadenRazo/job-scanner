import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "jazzhr" });

interface JazzHRJob {
  id: number | string;
  title: string;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  country_id?: number | string | null;
  country?: string | null;
  department?: string | null;
  department_id?: number | string | null;
  created_at?: string | null;
  board_code?: string | null;
}

/**
 * Strip HTML tags + decode the most common entities that JazzHR's
 * `description` field returns. Kept inline so this scraper has no
 * cross-file dependency on another scraper's helper.
 */
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
  // JazzHR emits either ISO 8601 or "YYYY-MM-DD HH:MM:SS" (space-separated).
  // new Date() accepts ISO natively; normalize the legacy form to UTC ISO.
  const normalized = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(" ", "T") + "Z" : s;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildLocation(job: JazzHRJob): string | null {
  const parts = [job.city, job.state, job.country]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function detectRemote(locationName: string | null, countryId: number | string | null | undefined): boolean {
  if (locationName && /remote/i.test(locationName)) return true;
  if (countryId !== null && countryId !== undefined) {
    const n = typeof countryId === "number" ? countryId : Number.parseInt(String(countryId), 10);
    if (Number.isFinite(n) && n === 999) return true;
  }
  return false;
}

export const jazzhrScraper: Scraper = async ({ company, userAgent }) => {
  const subdomain = company.slug;
  const url = `https://${subdomain}.applytojob.com/api/appl/?display=json`;

  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept: "application/json",
    },
  });

  if (statusCode === 404) {
    log.warn({ slug: subdomain }, "board not found (404)");
    return [];
  }
  if (statusCode >= 400) {
    const text = await body.text();
    throw new Error(`jazzhr ${subdomain} returned ${statusCode}: ${text.slice(0, 200)}`);
  }

  let data: unknown;
  try {
    data = await body.json();
  } catch (err) {
    log.warn({ slug: subdomain, err: (err as Error).message }, "jazzhr json parse failed");
    return [];
  }

  if (!Array.isArray(data)) {
    log.warn({ slug: subdomain }, "jazzhr returned non-array payload");
    return [];
  }

  const items = data as JazzHRJob[];
  const jobs: ScrapedJob[] = items.map((item) => {
    const locationStr = buildLocation(item);
    const preferredId =
      item.board_code && String(item.board_code).length > 0 ? String(item.board_code) : String(item.id);
    return {
      ats: "jazzhr",
      externalId: preferredId,
      companyId: company.id,
      title: item.title,
      location: locationStr,
      remote: detectRemote(locationStr, item.country_id ?? null),
      seniority: null,
      postedAt: parsePostedAt(item.created_at ?? null),
      url: `https://${subdomain}.applytojob.com/apply/${preferredId}`,
      descriptionMd: htmlToText(item.description ?? null) ?? "",
      raw: item,
    };
  });

  log.info({ slug: subdomain, count: jobs.length, total: items.length }, "jazzhr fetch ok");
  return jobs;
};

import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "remoteok" });

/**
 * RemoteOK's public job feed. The array's first element is a legal
 * disclaimer object (no `id`/`position`); subsequent elements are jobs.
 * Every listing is remote by definition.
 */
interface RemoteOkJob {
  id?: number | string;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  logo?: string;
  description?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
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

function parsePostedAt(iso: string | undefined, epoch: number | undefined): Date | null {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof epoch === "number" && Number.isFinite(epoch)) {
    const d = new Date(epoch * 1000);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export const remoteokScraper: Scraper = async ({ company, userAgent }) => {
  const url = "https://remoteok.com/api";

  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept: "application/json",
    },
  });

  if (statusCode === 404) {
    log.warn({ source: "remoteok" }, "feed not found (404)");
    return [];
  }
  if (statusCode >= 400) {
    const text = await body.text();
    throw new Error(`remoteok returned ${statusCode}: ${text.slice(0, 200)}`);
  }

  const data = (await body.json()) as unknown;
  if (!Array.isArray(data)) {
    log.warn({ source: "remoteok" }, "unexpected payload shape; returning []");
    return [];
  }

  // Drop the leading legal disclaimer object.
  const entries = (data as RemoteOkJob[]).slice(1);

  const jobs: ScrapedJob[] = entries
    .filter((j) => j && j.id !== undefined && j.id !== null && typeof j.position === "string" && j.position.length > 0)
    .map((j) => {
      const location = j.location && j.location.length > 0 ? j.location : null;
      return {
        ats: "remoteok",
        externalId: String(j.id),
        companyId: company.id,
        title: j.position as string,
        location,
        remote: true,
        seniority: null,
        postedAt: parsePostedAt(j.date, j.epoch),
        url: j.url ?? `https://remoteok.com/remote-jobs/${j.id}`,
        descriptionMd: htmlToText(j.description),
        raw: j,
        sourceCompanyName: j.company ?? null,
      };
    });

  log.info({ source: "remoteok", count: jobs.length }, "remoteok fetch ok");
  return jobs;
};

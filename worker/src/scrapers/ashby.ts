import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "ashby" });

interface AshbyJob {
  id: string;
  title: string;
  department?: string | null;
  team?: string | null;
  location?: string | null;
  employmentType?: string | null;
  isRemote?: boolean | null;
  publishedDate?: string | null;
  descriptionPlain?: string | null;
  descriptionHtml?: string | null;
  jobUrl: string;
  applyUrl?: string | null;
}

interface AshbyResponse {
  apiVersion?: string;
  jobs: AshbyJob[];
}

/**
 * Strip HTML tags + decode the most common entities. Ashby usually gives
 * us `descriptionPlain` already, but we keep this as a fallback for boards
 * that only populate `descriptionHtml`.
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

function detectRemote(locationName: string | null | undefined): boolean | null {
  if (!locationName) return null;
  return /remote|anywhere|work[-\s]?from[-\s]?home/i.test(locationName);
}

function parsePostedAt(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const ashbyScraper: Scraper = async ({ company, userAgent }) => {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.slug)}?includeCompensation=true`;

  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept: "application/json",
    },
  });

  if (statusCode === 404) {
    log.warn({ slug: company.slug }, "board not found (404)");
    return [];
  }
  if (statusCode >= 400) {
    const text = await body.text();
    throw new Error(`ashby ${company.slug} returned ${statusCode}: ${text.slice(0, 200)}`);
  }

  const data = (await body.json()) as AshbyResponse;
  if (!data || !Array.isArray(data.jobs)) {
    throw new Error(`ashby ${company.slug} returned unexpected payload`);
  }

  const jobs: ScrapedJob[] = data.jobs.map((j) => {
    const location = j?.location ?? null;
    const remote =
      typeof j?.isRemote === "boolean" ? j.isRemote : detectRemote(location);
    const plain = j?.descriptionPlain?.trim();
    const descriptionMd =
      plain && plain.length > 0 ? plain : htmlToText(j?.descriptionHtml) ?? "";
    return {
      ats: "ashby",
      externalId: String(j.id),
      companyId: company.id,
      title: j.title,
      location,
      remote,
      seniority: null,
      postedAt: parsePostedAt(j?.publishedDate),
      url: j.jobUrl,
      descriptionMd,
      raw: j,
    };
  });

  log.info({ slug: company.slug, count: jobs.length }, "ashby fetch ok");
  return jobs;
};

import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "remotive" });

interface RemotiveJob {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  company_logo?: string;
  category?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  tags?: string[];
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
  "job-count"?: number;
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

export const remotiveScraper: Scraper = async ({ company, userAgent }) => {
  const url = "https://remotive.com/api/remote-jobs";

  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept: "application/json",
    },
  });

  if (statusCode === 404) {
    log.warn({ source: "remotive" }, "feed not found (404)");
    return [];
  }
  if (statusCode >= 400) {
    const text = await body.text();
    throw new Error(`remotive returned ${statusCode}: ${text.slice(0, 200)}`);
  }

  const data = (await body.json()) as RemotiveResponse;
  if (!data || !Array.isArray(data.jobs)) {
    log.warn({ source: "remotive" }, "unexpected payload shape; returning []");
    return [];
  }

  const jobs: ScrapedJob[] = data.jobs
    .filter((j) => j && j.id !== undefined && j.id !== null && typeof j.title === "string" && j.title.length > 0)
    .map((j) => {
      const location =
        typeof j.candidate_required_location === "string" && j.candidate_required_location.length > 0
          ? j.candidate_required_location
          : null;
      return {
        ats: "remotive",
        externalId: String(j.id),
        companyId: company.id,
        title: j.title as string,
        location,
        remote: true,
        seniority: j.job_type && j.job_type.length > 0 ? j.job_type : null,
        postedAt: parsePostedAt(j.publication_date),
        url: j.url ?? "",
        descriptionMd: htmlToText(j.description),
        raw: j,
        sourceCompanyName: j.company_name ?? null,
      };
    });

  log.info({ source: "remotive", count: jobs.length, total: data["job-count"] }, "remotive fetch ok");
  return jobs;
};

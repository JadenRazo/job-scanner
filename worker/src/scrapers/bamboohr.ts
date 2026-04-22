import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "bamboohr" });

interface BambooLocation {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  addressLine1?: string | null;
}

interface BambooJob {
  id: number | string;
  jobOpeningName: string;
  employmentStatusLabel?: string | null;
  departmentLabel?: string | null;
  location?: BambooLocation | null;
  datePosted?: string | null;
  jobOpeningStatus?: string | null;
}

interface BambooResponse {
  result?: BambooJob[];
  meta?: unknown;
}

function parsePostedAt(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildLocation(loc: BambooLocation | null | undefined): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.state, loc.country]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function detectRemote(locationName: string | null): boolean | null {
  if (!locationName) return null;
  return /remote/i.test(locationName);
}

export const bamboohrScraper: Scraper = async ({ company, userAgent }) => {
  const subdomain = company.slug;
  const url = `https://${subdomain}.bamboohr.com/careers/list`;

  const { statusCode, body, headers } = await request(url, {
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
    throw new Error(`bamboohr ${subdomain} returned ${statusCode}: ${text.slice(0, 200)}`);
  }

  const contentType = (headers["content-type"] ?? "").toString().toLowerCase();
  if (!contentType.includes("json")) {
    log.warn({ slug: subdomain, contentType }, "bamboohr returned non-json response");
    return [];
  }

  let data: BambooResponse;
  try {
    data = (await body.json()) as BambooResponse;
  } catch (err) {
    log.warn({ slug: subdomain, err: (err as Error).message }, "bamboohr json parse failed");
    return [];
  }

  if (!data || !Array.isArray(data.result)) {
    log.warn({ slug: subdomain }, "bamboohr returned no result array");
    return [];
  }

  const jobs: ScrapedJob[] = data.result.map((j) => {
    const locationStr = buildLocation(j.location ?? null);
    return {
      ats: "bamboohr",
      externalId: String(j.id),
      companyId: company.id,
      title: j.jobOpeningName,
      location: locationStr,
      remote: detectRemote(locationStr),
      seniority: null,
      postedAt: parsePostedAt(j.datePosted ?? null),
      url: `https://${subdomain}.bamboohr.com/careers/${j.id}`,
      descriptionMd: "",
      raw: j,
    };
  });

  log.info({ slug: subdomain, count: jobs.length, total: data.result.length }, "bamboohr fetch ok");
  return jobs;
};

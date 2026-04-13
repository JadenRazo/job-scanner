import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "lever" });

interface LeverList {
  text?: string;
  content?: string;
}

interface LeverPosting {
  id: string;
  text: string;
  categories?: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
  };
  workplaceType?: string;
  createdAt?: number;
  descriptionPlain?: string;
  description?: string;
  lists?: LeverList[];
  additional?: string;
  additionalPlain?: string;
  hostedUrl: string;
  applyUrl?: string;
}

/**
 * Strip HTML tags + decode the most common entities that Lever's
 * `description`/`lists[].content` fields return. Good enough for LLM
 * ingestion; we keep the original payload verbatim in `raw`.
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

function parsePostedAt(ms: unknown): Date | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildDescription(posting: LeverPosting): string | null {
  const parts: string[] = [];

  const main = posting.descriptionPlain ?? htmlToText(posting.description);
  if (main) parts.push(main);

  if (Array.isArray(posting.lists)) {
    for (const list of posting.lists) {
      const body = htmlToText(list.content);
      if (!body) continue;
      const heading = list.text?.trim();
      parts.push(heading ? `${heading}\n${body}` : body);
    }
  }

  const extra = posting.additionalPlain ?? htmlToText(posting.additional);
  if (extra) parts.push(extra);

  const joined = parts.join("\n\n").trim();
  return joined.length > 0 ? joined : null;
}

export const leverScraper: Scraper = async ({ company, userAgent }) => {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company.slug)}?mode=json`;

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
    throw new Error(`lever ${company.slug} returned ${statusCode}: ${text.slice(0, 200)}`);
  }

  const data = (await body.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`lever ${company.slug} returned unexpected payload`);
  }

  const jobs: ScrapedJob[] = (data as LeverPosting[]).map((p) => {
    const location = p.categories?.location ?? null;
    const workplaceRemote = p.workplaceType === "remote";
    const remote = workplaceRemote ? true : detectRemote(location);
    return {
      ats: "lever",
      externalId: p.id,
      companyId: company.id,
      title: p.text,
      location,
      remote,
      seniority: null,
      postedAt: parsePostedAt(p.createdAt),
      url: p.hostedUrl,
      descriptionMd: buildDescription(p),
      raw: p,
    };
  });

  log.info({ slug: company.slug, count: jobs.length }, "lever fetch ok");
  return jobs;
};

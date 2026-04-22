import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "greenhouse" });

interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string | null;
  absolute_url: string;
  location: { name: string } | null;
  content: string | null;
  metadata?: Array<{ name: string; value: unknown }>;
  offices?: Array<{ name?: string; location?: string }>;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta?: { total?: number };
}

/**
 * Strip HTML tags + decode the most common entities that Greenhouse's
 * `content` field returns. Good enough for LLM ingestion; we keep the
 * original HTML verbatim in `raw` for later if a richer parse is needed.
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

export const greenhouseScraper: Scraper = async ({ company, userAgent }) => {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.slug)}/jobs?content=true`;

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
    throw new Error(`greenhouse ${company.slug} returned ${statusCode}: ${text.slice(0, 200)}`);
  }

  const data = (await body.json()) as GreenhouseResponse;
  if (!data || !Array.isArray(data.jobs)) {
    throw new Error(`greenhouse ${company.slug} returned unexpected payload`);
  }

  const jobs: ScrapedJob[] = data.jobs.map((j) => {
    // Prefer a specific offices entry over the vague top-level `location.name`
    // which many Greenhouse employers fill with "In-Office" / "On-site" /
    // "Remote" while the actual city lives in `offices[]`. If multiple offices
    // are listed we join them so the deriveCountry heuristic has every hint.
    const officeLocs = (j.offices ?? [])
      .map((o) => o.location ?? o.name)
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    const rawLocation = j.location?.name ?? null;
    const locationName = (() => {
      if (officeLocs.length > 0) {
        // When the top-level location is a vague string, use offices only.
        // When it's something more specific ("San Francisco"), prepend it.
        const vague = !rawLocation || /^(in[-\s]?office|on[-\s]?site|remote|hybrid|multiple locations|\d+ locations?)$/i.test(rawLocation.trim());
        return vague
          ? officeLocs.join(" | ")
          : `${rawLocation} | ${officeLocs.join(" | ")}`;
      }
      return rawLocation;
    })();
    return {
      ats: "greenhouse",
      externalId: String(j.id),
      companyId: company.id,
      title: j.title,
      location: locationName,
      remote: detectRemote(locationName),
      seniority: null,
      postedAt: parsePostedAt(j.updated_at),
      url: j.absolute_url,
      descriptionMd: htmlToText(j.content),
      raw: j,
    };
  });

  log.info({ slug: company.slug, count: jobs.length, total: data.meta?.total }, "greenhouse fetch ok");
  return jobs;
};

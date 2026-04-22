import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "simplifyjobs" });

/**
 * SimplifyJobs maintains two open-source README repos that cross-compile
 * a canonical listings.json. We pull each repo's JSON directly from raw
 * GitHub; the /dev/ branch is source-of-truth, with /main/ as a fallback
 * for readers who don't mirror dev to main promptly.
 */
interface SimplifyListing {
  id?: string | number;
  company_name?: string;
  title?: string;
  locations?: string[];
  url?: string;
  date_posted?: number;
  date_updated?: number;
  terms?: string[];
  active?: boolean;
  is_visible?: boolean;
  sponsorship?: string;
  season?: string;
  company_url?: string;
}

type Kind = "intern" | "newgrad";

interface RepoSpec {
  kind: Kind;
  devUrl: string;
  mainUrl: string;
}

const REPOS: RepoSpec[] = [
  {
    kind: "intern",
    devUrl: "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
    mainUrl: "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/main/.github/scripts/listings.json",
  },
  {
    kind: "newgrad",
    devUrl: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    mainUrl: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/main/.github/scripts/listings.json",
  },
];

function parsePostedAt(seconds: number | undefined): Date | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function detectRemote(locations: string[] | undefined): boolean {
  if (!locations || locations.length === 0) return false;
  return locations.some((l) => /remote/i.test(l));
}

async function fetchJson(url: string, userAgent: string): Promise<unknown | null> {
  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept: "application/json",
    },
  });
  if (statusCode === 404) return null;
  if (statusCode >= 400) {
    const text = await body.text();
    throw new Error(`simplifyjobs ${url} returned ${statusCode}: ${text.slice(0, 200)}`);
  }
  return (await body.json()) as unknown;
}

async function fetchRepo(spec: RepoSpec, userAgent: string): Promise<SimplifyListing[]> {
  try {
    let data = await fetchJson(spec.devUrl, userAgent);
    if (data === null) {
      log.warn({ source: "simplifyjobs", kind: spec.kind, branch: "dev" }, "dev branch 404; trying main");
      data = await fetchJson(spec.mainUrl, userAgent);
    }
    if (!Array.isArray(data)) {
      log.warn({ source: "simplifyjobs", kind: spec.kind }, "unexpected payload shape; skipping repo");
      return [];
    }
    return data as SimplifyListing[];
  } catch (err) {
    log.warn(
      { source: "simplifyjobs", kind: spec.kind, err: (err as Error).message },
      "repo fetch failed; skipping",
    );
    return [];
  }
}

function toScrapedJobs(listings: SimplifyListing[], kind: Kind, companyId: number): ScrapedJob[] {
  return listings
    .filter(
      (item) =>
        item &&
        item.active === true &&
        item.is_visible !== false &&
        item.id !== undefined &&
        item.id !== null &&
        typeof item.title === "string" &&
        item.title.length > 0 &&
        typeof item.url === "string" &&
        item.url.length > 0,
    )
    .map((item) => {
      const locations = Array.isArray(item.locations)
        ? item.locations.filter((l) => typeof l === "string")
        : [];
      const location = locations.length > 0 ? locations.join(", ") : null;
      return {
        ats: "simplifyjobs",
        externalId: `simplify-${kind}-${String(item.id)}`,
        companyId,
        title: item.title as string,
        location,
        remote: detectRemote(locations),
        seniority: kind === "intern" ? "internship" : "new_grad",
        postedAt: parsePostedAt(item.date_posted),
        url: item.url as string,
        descriptionMd: "",
        raw: item,
        sourceCompanyName: item.company_name ?? null,
      };
    });
}

export const simplifyjobsScraper: Scraper = async ({ company, userAgent }) => {
  const results = await Promise.all(REPOS.map((spec) => fetchRepo(spec, userAgent)));

  const perRepo = results.map((listings, i) => toScrapedJobs(listings, REPOS[i].kind, company.id));
  const jobs: ScrapedJob[] = perRepo.flat();

  log.info(
    {
      source: "simplifyjobs",
      internCount: perRepo[0].length,
      newgradCount: perRepo[1].length,
      count: jobs.length,
    },
    "simplifyjobs fetch ok",
  );
  return jobs;
};

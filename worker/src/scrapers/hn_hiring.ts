import { request } from "undici";
import type { Scraper, ScrapedJob } from "./types.js";
import { logger } from "../logger.js";

const log = logger.child({ mod: "hn_hiring" });

interface AlgoliaStoryHit {
  objectID: string;
  title?: string;
  created_at?: string;
  created_at_i?: number;
}

interface AlgoliaCommentHit {
  objectID: string;
  comment_text?: string;
  created_at?: string;
  created_at_i?: number;
  parent_id?: number;
  story_id?: number;
  author?: string;
}

interface AlgoliaSearchResponse<T> {
  hits?: T[];
}

/**
 * HN Algolia comments arrive as HTML, and the body aggressively uses hex
 * entities (`&#x27;` for `'`, `&#x2F;` for `/`) inside URLs. We decode a
 * few extra entities beyond the standard htmlToText used by direct-ATS
 * scrapers so our URL extractor doesn't mangle hrefs.
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
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x3D;/gi, "=")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
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

// Match hiring threads like: "Ask HN: Who is hiring? (March 2026)"
const HIRING_TITLE_RX = /ask hn.*who.*hiring/i;

// Common location cues in HN hiring posts. Order matters: country/full-name first, abbreviations later.
const LOCATION_PATTERNS: Array<[RegExp, string]> = [
  [/\bremote\s*\(\s*us[^)]*\)/i, "Remote (US)"],
  [/\bremote\s*\(\s*eu[^)]*\)/i, "Remote (EU)"],
  [/\bremote\s*\(\s*uk[^)]*\)/i, "Remote (UK)"],
  [/\bremote\s*\(\s*worldwide[^)]*\)/i, "Remote (Worldwide)"],
  [/\bfully\s+remote\b/i, "Remote"],
  [/\banywhere\b/i, "Anywhere"],
  [/\bworldwide\b/i, "Worldwide"],
  [/\bsan francisco\b/i, "San Francisco"],
  [/\bnew york city\b|\bnew york\b|\bnyc\b/i, "New York"],
  [/\bseattle\b/i, "Seattle"],
  [/\blos angeles\b|\bla\b/i, "Los Angeles"],
  [/\bboston\b/i, "Boston"],
  [/\baustin\b/i, "Austin"],
  [/\bchicago\b/i, "Chicago"],
  [/\bdenver\b/i, "Denver"],
  [/\bportland\b/i, "Portland"],
  [/\batlanta\b/i, "Atlanta"],
  [/\bmiami\b/i, "Miami"],
  [/\btoronto\b/i, "Toronto"],
  [/\bvancouver\b/i, "Vancouver"],
  [/\bmontreal\b/i, "Montreal"],
  [/\blondon\b/i, "London"],
  [/\bberlin\b/i, "Berlin"],
  [/\bamsterdam\b/i, "Amsterdam"],
  [/\bparis\b/i, "Paris"],
  [/\bdublin\b/i, "Dublin"],
  [/\btel aviv\b/i, "Tel Aviv"],
  [/\bsingapore\b/i, "Singapore"],
  [/\btokyo\b/i, "Tokyo"],
  [/\bsydney\b/i, "Sydney"],
  [/\bbangalore\b|\bbengaluru\b/i, "Bangalore"],
];

function extractLocation(text: string): string | null {
  for (const [rx, label] of LOCATION_PATTERNS) {
    if (rx.test(text)) return label;
  }
  return null;
}

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)<>"']+/);
  if (!m) return null;
  // Trim common trailing punctuation that a URL wouldn't legitimately end in.
  return m[0].replace(/[.,;:!?]+$/, "");
}

/**
 * Best-effort split of the HN first-line header into (company, rest).
 * HN hiring convention: "Company | Role | Location | $salary".
 * Some posts use " - " or " — " instead of " | ". We try pipe first, then
 * unicode em-dash, then plain hyphen with surrounding spaces.
 */
function splitHeader(firstLine: string): string | null {
  for (const sep of [" | ", " — ", " – ", " - "]) {
    const idx = firstLine.indexOf(sep);
    if (idx > 0) {
      const first = firstLine.slice(0, idx).trim();
      if (first.length > 0 && first.length <= 120) return first;
    }
  }
  return null;
}

function isLikelyJobPost(plain: string): boolean {
  if (plain.length < 80) return false;
  const low = plain.toLowerCase().trimStart();
  if (low.startsWith("is this hiring")) return false;
  if (low.startsWith("is there a ")) return false;
  if (low.startsWith("where is the ")) return false;
  if (low.startsWith("when is the ")) return false;
  if (low.startsWith("thank ")) return false;
  return true;
}

async function findLatestHiringStory(userAgent: string): Promise<AlgoliaStoryHit | null> {
  // search_by_date sorts by created_at desc so the current month's thread
  // is always the first matching hit. The plain /search endpoint sorts by
  // Algolia's relevance score, which returns ancient threads at the top.
  const url =
    "https://hn.algolia.com/api/v1/search_by_date?query=Who%20is%20hiring&tags=story,author_whoishiring&hitsPerPage=6";

  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept: "application/json",
    },
  });

  if (statusCode >= 400) {
    log.warn({ source: "hn_hiring", statusCode }, "algolia story search failed");
    return null;
  }

  const data = (await body.json()) as AlgoliaSearchResponse<AlgoliaStoryHit>;
  if (!data?.hits || data.hits.length === 0) return null;

  const matching = data.hits.filter((h) => typeof h.title === "string" && HIRING_TITLE_RX.test(h.title));
  if (matching.length === 0) return null;

  matching.sort((a, b) => (b.created_at_i ?? 0) - (a.created_at_i ?? 0));
  return matching[0];
}

async function fetchTopLevelComments(
  storyId: string,
  userAgent: string,
): Promise<AlgoliaCommentHit[]> {
  const url = `https://hn.algolia.com/api/v1/search?tags=comment,story_${encodeURIComponent(storyId)}&hitsPerPage=1000`;

  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept: "application/json",
    },
  });

  if (statusCode >= 400) {
    log.warn({ source: "hn_hiring", statusCode }, "algolia comment fetch failed");
    return [];
  }

  const data = (await body.json()) as AlgoliaSearchResponse<AlgoliaCommentHit>;
  return Array.isArray(data?.hits) ? data.hits : [];
}

export const hnHiringScraper: Scraper = async ({ company, userAgent }) => {
  const story = await findLatestHiringStory(userAgent);
  if (!story) {
    log.warn({ source: "hn_hiring" }, "no current hiring thread found; returning []");
    return [];
  }

  const storyId = story.objectID;
  const storyIdNum = Number(storyId);
  const comments = await fetchTopLevelComments(storyId, userAgent);
  if (comments.length === 0) {
    log.warn({ source: "hn_hiring", storyId }, "no comments returned; returning []");
    return [];
  }

  // Top-level only: parent_id === story_id.
  const topLevel = comments.filter(
    (c) => typeof c.parent_id === "number" && c.parent_id === storyIdNum,
  );

  const jobs: ScrapedJob[] = [];
  for (const hit of topLevel) {
    const plain = htmlToText(hit.comment_text);
    if (!plain) continue;
    if (!isLikelyJobPost(plain)) continue;

    const lines = plain.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    const firstLine = lines[0];

    const company_ = splitHeader(firstLine);
    const title = firstLine.slice(0, 200);
    const location = extractLocation(plain);
    const remote = /\bremote\b/i.test(plain);
    const extractedUrl = extractUrl(plain);

    jobs.push({
      ats: "hn_hiring",
      externalId: `hn-${String(hit.objectID)}`,
      companyId: company.id,
      title,
      location,
      remote,
      seniority: null,
      postedAt: parsePostedAt(hit.created_at),
      url: extractedUrl ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      descriptionMd: plain,
      raw: hit,
      sourceCompanyName: company_,
    });
  }

  log.info(
    { source: "hn_hiring", storyId, commentsTotal: comments.length, topLevel: topLevel.length, count: jobs.length },
    "hn_hiring fetch ok",
  );
  return jobs;
};

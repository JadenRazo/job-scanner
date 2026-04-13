// Query helpers for the Recommended Jobs view.
//
// A "recommended" job is a rawJob that has a corresponding jobMatches row
// with stage2_score >= profile.score_threshold and a status that isn't
// archived or rejected. All list/detail shapes here are safe to serialize
// directly to JSON responses.

import { and, asc, desc, eq, gte, ilike, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  companies,
  jobMatches,
  profile,
  rawJobs,
} from "@/lib/db/schema-readonly";

export type JobSort = "posted_desc" | "score_desc" | "title_asc";
export type JobStatus = "new" | "reviewed" | "applied" | "archived" | "rejected";

const ACTIVE_STATUSES: JobStatus[] = ["new", "reviewed", "applied"];

export interface RecommendedJob {
  matchId: number;
  jobId: number;
  title: string;
  companyId: number;
  companyName: string;
  location: string | null;
  remote: boolean | null;
  seniority: string | null;
  postedAt: string | null;
  url: string;
  score: number | null;
  rationale: string | null;
  skills: string[];
  gaps: string[];
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListRecommendedJobsInput {
  q?: string;
  statuses?: JobStatus[];
  minScore?: number;
  sort?: JobSort;
  limit?: number;
  offset?: number;
}

export interface ListRecommendedJobsResult {
  jobs: RecommendedJob[];
  total: number;
  scoreThreshold: number;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

async function getScoreThreshold(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ t: profile.scoreThreshold })
    .from(profile)
    .where(eq(profile.id, 1))
    .limit(1);
  return row?.t ?? 70;
}

export async function listRecommendedJobs(
  input: ListRecommendedJobsInput = {},
): Promise<ListRecommendedJobsResult> {
  const db = getDb();
  const scoreThreshold = await getScoreThreshold();

  const statuses =
    input.statuses && input.statuses.length > 0
      ? input.statuses
      : ACTIVE_STATUSES;
  const minScore = input.minScore ?? scoreThreshold;
  const sort: JobSort = input.sort ?? "posted_desc";
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);

  const conditions = [
    gte(jobMatches.stage2Score, minScore),
    inArray(jobMatches.status, statuses),
  ];
  if (input.q && input.q.trim().length > 0) {
    conditions.push(ilike(rawJobs.title, `%${input.q.trim()}%`));
  }
  const whereExpr = and(...conditions);

  const orderBy = (() => {
    switch (sort) {
      case "score_desc":
        return [desc(jobMatches.stage2Score), desc(rawJobs.postedAt)];
      case "title_asc":
        return [asc(rawJobs.title), desc(rawJobs.postedAt)];
      case "posted_desc":
      default:
        // NULLS LAST so missing postedAt sinks to the bottom.
        return [
          sql`${rawJobs.postedAt} DESC NULLS LAST`,
          desc(jobMatches.stage2Score),
        ];
    }
  })();

  const rows = await db
    .select({
      matchId: jobMatches.id,
      jobId: rawJobs.id,
      title: rawJobs.title,
      companyId: companies.id,
      companyName: companies.name,
      location: rawJobs.location,
      remote: rawJobs.remote,
      seniority: rawJobs.seniority,
      postedAt: rawJobs.postedAt,
      url: rawJobs.url,
      score: jobMatches.stage2Score,
      rationale: jobMatches.stage2Rationale,
      skills: jobMatches.stage2Skills,
      gaps: jobMatches.stage2Gaps,
      status: jobMatches.status,
      createdAt: jobMatches.createdAt,
      updatedAt: jobMatches.updatedAt,
    })
    .from(jobMatches)
    .innerJoin(rawJobs, eq(jobMatches.jobId, rawJobs.id))
    .innerJoin(companies, eq(rawJobs.companyId, companies.id))
    .where(whereExpr)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ c: sql<number>`count(*)`.mapWith(Number) })
    .from(jobMatches)
    .innerJoin(rawJobs, eq(jobMatches.jobId, rawJobs.id))
    .innerJoin(companies, eq(rawJobs.companyId, companies.id))
    .where(whereExpr);

  const jobs: RecommendedJob[] = rows.map((r) => ({
    matchId: r.matchId,
    jobId: r.jobId,
    title: r.title,
    companyId: r.companyId,
    companyName: r.companyName,
    location: r.location,
    remote: r.remote,
    seniority: r.seniority,
    postedAt: r.postedAt ? r.postedAt.toISOString() : null,
    url: r.url,
    score: r.score,
    rationale: r.rationale,
    skills: parseJsonArray(r.skills),
    gaps: parseJsonArray(r.gaps),
    status: r.status as JobStatus,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { jobs, total: countRow?.c ?? 0, scoreThreshold };
}

export async function updateJobMatchStatus(
  matchId: number,
  status: JobStatus,
): Promise<{ matchId: number; status: JobStatus } | null> {
  const db = getDb();
  const [row] = await db
    .update(jobMatches)
    .set({ status, updatedAt: new Date() })
    .where(eq(jobMatches.id, matchId))
    .returning({ id: jobMatches.id, status: jobMatches.status });
  if (!row) return null;
  return { matchId: row.id, status: row.status as JobStatus };
}

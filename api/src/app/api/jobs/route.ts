import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiResponse, requireAuthApi } from "@/lib/api-utils";
import {
  listRecommendedJobs,
  type JobSort,
  type JobStatus,
} from "@/lib/db/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = [
  "new",
  "reviewed",
  "applied",
  "archived",
  "rejected",
] as const;
const SORTS = ["posted_desc", "score_desc", "title_asc"] as const;

const querySchema = z.object({
  q: z.string().max(200).optional(),
  statuses: z.string().max(200).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  sort: z.enum(SORTS).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }

  const statuses: JobStatus[] | undefined = parsed.data.statuses
    ?.split(",")
    .map((s) => s.trim())
    .filter((s): s is JobStatus =>
      (STATUSES as readonly string[]).includes(s),
    );

  try {
    const result = await listRecommendedJobs({
      q: parsed.data.q,
      statuses,
      minScore: parsed.data.minScore,
      sort: parsed.data.sort as JobSort | undefined,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return apiResponse(result);
  } catch (err) {
    console.error("GET /api/jobs failed", err);
    return apiError("Failed to list jobs", 500);
  }
}

import type { NextRequest } from "next/server";
import { apiError, apiResponse, requireAuthApi } from "@/lib/api-utils";
import { getJobArtifacts } from "@/lib/db/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return apiError("Invalid match id", 400);
  }
  const row = await getJobArtifacts(matchId);
  if (!row) return apiError("Match not found", 404);
  return apiResponse(row);
}

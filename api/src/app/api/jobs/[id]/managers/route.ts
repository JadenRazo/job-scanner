import type { NextRequest } from "next/server";
import { apiError, apiResponse, requireAuthApi } from "@/lib/api-utils";
import { getJobArtifacts, markArtifactQueued } from "@/lib/db/jobs";
import { enqueueArtifactManagers } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

  const existing = await getJobArtifacts(matchId);
  if (!existing) return apiError("Match not found", 404);
  if (existing.managersStatus === "queued" || existing.managersStatus === "running") {
    return apiResponse({ matchId, status: existing.managersStatus });
  }

  const updated = await markArtifactQueued(matchId, "managers");
  if (!updated) return apiError("Match not found", 404);
  try {
    await enqueueArtifactManagers(matchId);
  } catch (err) {
    console.error("enqueue managers failed", err);
    return apiError("Failed to enqueue job", 500);
  }
  return apiResponse({ matchId, status: "queued" });
}

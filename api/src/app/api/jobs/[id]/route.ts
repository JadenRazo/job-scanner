import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiResponse, requireAuthApi } from "@/lib/api-utils";
import { updateJobMatchStatus } from "@/lib/db/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["new", "reviewed", "applied", "archived", "rejected"]),
});

export async function PATCH(
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  try {
    const row = await updateJobMatchStatus(matchId, parsed.data.status);
    if (!row) return apiError("Match not found", 404);
    return apiResponse(row);
  } catch (err) {
    console.error("PATCH /api/jobs/[id] failed", err);
    return apiError("Failed to update job status", 500);
  }
}

import type { NextRequest } from "next/server";
import { apiError, apiResponse, requireAuthApi } from "@/lib/api-utils";
import { activateResume } from "@/lib/db/resumes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return apiError("Invalid id", 400);

  try {
    const row = await activateResume(id);
    if (!row) return apiError("Resume not found", 404);
    return apiResponse({ resume: row });
  } catch (err) {
    console.error("POST /api/resumes/[id]/activate failed", err);
    return apiError("Failed to activate resume", 500);
  }
}

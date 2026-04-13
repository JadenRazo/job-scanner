import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiResponse, requireAuthApi } from "@/lib/api-utils";
import { deleteResume, getResume, updateResume } from "@/lib/db/resumes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    label: z.string().min(1).max(100).optional(),
    contentMd: z.string().min(1).max(50_000).optional(),
  })
  .refine((v) => v.label !== undefined || v.contentMd !== undefined, {
    message: "At least one of label or contentMd is required",
  });

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return apiError("Invalid id", 400);

  try {
    const row = await getResume(id);
    if (!row) return apiError("Resume not found", 404);
    return apiResponse({ resume: row });
  } catch (err) {
    console.error("GET /api/resumes/[id] failed", err);
    return apiError("Failed to load resume", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return apiError("Invalid id", 400);

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
    const row = await updateResume(id, parsed.data);
    if (!row) return apiError("Resume not found", 404);
    return apiResponse({ resume: row });
  } catch (err) {
    console.error("PATCH /api/resumes/[id] failed", err);
    return apiError("Failed to update resume", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return apiError("Invalid id", 400);

  try {
    const result = await deleteResume(id);
    if (!result) return apiError("Resume not found", 404);
    return apiResponse({
      deleted: result.deleted,
      promoted: result.promoted,
    });
  } catch (err) {
    console.error("DELETE /api/resumes/[id] failed", err);
    return apiError("Failed to delete resume", 500);
  }
}

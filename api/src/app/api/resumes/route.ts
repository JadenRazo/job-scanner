import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiResponse, requireAuthApi } from "@/lib/api-utils";
import { createResume, listResumes } from "@/lib/db/resumes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  label: z.string().min(1).max(100),
  contentMd: z.string().min(1).max(50_000),
});

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  try {
    const rows = await listResumes();
    return apiResponse({ resumes: rows });
  } catch (err) {
    console.error("GET /api/resumes failed", err);
    return apiError("Failed to list resumes", 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  try {
    const row = await createResume(parsed.data);
    return apiResponse({ resume: row }, 201);
  } catch (err) {
    console.error("POST /api/resumes failed", err);
    return apiError("Failed to create resume", 500);
  }
}

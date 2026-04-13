import type { NextRequest } from "next/server";
import { apiError, requireAuthApi } from "@/lib/api-utils";
import { getResumeOriginal } from "@/lib/db/resumes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Strip characters that would break a Content-Disposition header. Keeps the
// extension but drops path separators, quotes, and control chars.
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/["\r\n\t]/g, "").replace(/[\x00-\x1f]/g, "");
  return cleaned.trim() || "resume";
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
    const original = await getResumeOriginal(id);
    if (!original) return apiError("Resume file not found", 404);

    const safeName = sanitizeFilename(original.filename);
    // Copy into a fresh Uint8Array to get a plain ArrayBuffer — Buffer's
    // underlying buffer may be a pooled SharedArrayBuffer slice which the
    // Response constructor's type refuses.
    const body = new Uint8Array(original.bytes.byteLength);
    body.set(original.bytes);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": original.mime,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/resumes/[id]/download failed", err);
    return apiError("Failed to download resume", 500);
  }
}

import type { NextRequest } from "next/server";
import { apiError, requireAuthApi } from "@/lib/api-utils";
import { getTailoredBinary } from "@/lib/db/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; kind: string; format: string }> },
): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  const { id, kind, format } = await ctx.params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return apiError("Invalid match id", 400);
  }
  if (kind !== "resume" && kind !== "letter") {
    return apiError("Invalid kind", 400);
  }
  if (format !== "docx" && format !== "pdf") {
    return apiError("Invalid format", 400);
  }

  const bin = await getTailoredBinary(matchId, kind, format);
  if (!bin) return apiError("Not ready", 404);

  return new Response(new Uint8Array(bin.bytes), {
    status: 200,
    headers: {
      "content-type": bin.contentType,
      "content-disposition": `attachment; filename="${bin.filename}"`,
      "cache-control": "private, no-store",
      "content-length": String(bin.bytes.length),
    },
  });
}

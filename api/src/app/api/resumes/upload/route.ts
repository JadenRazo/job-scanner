import type { NextRequest } from "next/server";
import { apiError, apiResponse, requireAuthApi } from "@/lib/api-utils";
import { createResume } from "@/lib/db/resumes";
import { extractResumeText } from "@/lib/resumes/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB hard limit

function filenameStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.trim() || "Untitled";
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireAuthApi(req);
  if (auth.error) return auth.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError("Invalid multipart body", 400);
  }

  const fileField = form.get("file");
  if (!(fileField instanceof File)) {
    return apiError("Missing file field", 400);
  }
  if (fileField.size === 0) {
    return apiError("Uploaded file is empty", 400);
  }
  if (fileField.size > MAX_BYTES) {
    return apiError(
      `File is too large (max ${MAX_BYTES / (1024 * 1024)} MB)`,
      413,
    );
  }

  const labelRaw = form.get("label");
  const labelInput = typeof labelRaw === "string" ? labelRaw.trim() : "";
  const label = labelInput.length > 0 ? labelInput : filenameStem(fileField.name);
  if (label.length > 100) {
    return apiError("Label must be at most 100 characters", 400);
  }

  const arrayBuf = await fileField.arrayBuffer();
  // IMPORTANT: pdfjs-dist detaches the underlying ArrayBuffer of any Uint8Array
  // passed to getDocument(). We need to keep an untouched copy for storage, so
  // pass a fresh copy to the extractor and keep the original for the DB write.
  const storedBuffer = Buffer.from(arrayBuf);
  // Pass a separate copy to extractResumeText — pdfjs-dist detaches the
  // underlying ArrayBuffer of the Uint8Array it receives, which would leave
  // `storedBuffer` zero-length before we get a chance to persist it.
  const extractInput = Buffer.from(storedBuffer);
  const mime = fileField.type || "application/octet-stream";
  const filename = fileField.name || "upload";

  let text: string;
  try {
    const result = await extractResumeText(extractInput, mime, filename);
    text = result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "extraction failed";
    return apiError(`Failed to extract text: ${msg}`, 400);
  }

  if (text.length > 200_000) {
    return apiError("Extracted text exceeds 200,000 characters", 413);
  }

  try {
    const row = await createResume({
      label,
      contentMd: text,
      originalFilename: filename,
      originalMime: mime,
      originalBytes: storedBuffer,
    });
    return apiResponse(
      {
        resume: {
          ...row,
          hasOriginal: true,
        },
      },
      201,
    );
  } catch (err) {
    console.error("POST /api/resumes/upload failed", err);
    return apiError("Failed to create resume", 500);
  }
}

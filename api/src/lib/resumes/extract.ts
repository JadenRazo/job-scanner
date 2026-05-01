// Resume text extraction for uploaded files.
//
// Supports PDF (via unpdf — a serverless-friendly pdfjs wrapper that does
// not depend on @napi-rs/canvas, DOM polyfills, or a worker file in the
// Next standalone trace), DOCX (via mammoth), and plain text / markdown.
// Returns cleaned plain text preserving paragraph breaks.

import mammoth from "mammoth";

export interface ExtractResult {
  text: string;
  warnings: string[];
}

const MIME_PDF = "application/pdf";
const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_MD = "text/markdown";
const MIME_TXT = "text/plain";

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

function cleanText(raw: string): string {
  const perLine = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n");
  // Collapse 3+ blank lines into 2.
  const collapsed = perLine.replace(/\n{3,}/g, "\n\n");
  return collapsed.trim();
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  // unpdf bundles a serverless-built pdfjs internally — no canvas peer dep
  // is exercised by extractText, no worker file to register, no DOM polyfills.
  const { extractText, getDocumentProxy } = await import("unpdf");

  const data = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  let pdf;
  try {
    pdf = await getDocumentProxy(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to parse PDF: ${msg}`);
  }

  const { text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n\n") : text;
  const cleaned = cleanText(merged);
  if (cleaned.length === 0) {
    throw new Error(
      "PDF contained no extractable text (likely a scanned image — try a text-based PDF or paste the content manually)",
    );
  }
  return { text: cleaned, warnings: [] };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = cleanText(result.value ?? "");
  const warnings = (result.messages ?? []).map((m) => m.message);
  if (text.length === 0) {
    throw new Error("DOCX contained no extractable text");
  }
  return { text, warnings };
}

function extractPlain(buffer: Buffer): ExtractResult {
  const text = cleanText(buffer.toString("utf8"));
  if (text.length === 0) {
    throw new Error("file contained no text");
  }
  return { text, warnings: [] };
}

export async function extractResumeText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractResult> {
  const mime = mimeType.toLowerCase();
  const ext = extOf(filename);

  if (mime === MIME_PDF || ext === ".pdf") {
    return extractPdf(buffer);
  }
  if (mime === MIME_DOCX || ext === ".docx") {
    return extractDocx(buffer);
  }
  if (
    mime === MIME_MD ||
    mime === MIME_TXT ||
    ext === ".md" ||
    ext === ".txt"
  ) {
    return extractPlain(buffer);
  }
  throw new Error(`unsupported file type: ${mimeType || ext || "unknown"}`);
}

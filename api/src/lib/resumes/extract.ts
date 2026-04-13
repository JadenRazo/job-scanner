// Resume text extraction for uploaded files.
//
// Supports PDF (via pdfjs-dist legacy build), DOCX (via mammoth), and plain
// text / markdown. Returns cleaned plain text preserving paragraph breaks.
//
// IMPORTANT: pdfjs-dist must be imported from the "legacy" build — the default
// build depends on DOM globals that don't exist in Node.

import mammoth from "mammoth";
// pdfjs-dist legacy build ships as an ESM module. We import it dynamically
// inside the handler to avoid any module-load side effects at boot.

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
  const warnings: string[] = [];
  // pdfjs-dist tries to polyfill DOMMatrix/Path2D/ImageData from
  // @napi-rs/canvas in Node. Its internal `require("@napi-rs/canvas")` is
  // dynamic and invisible to Next's file tracer — import it explicitly here
  // so the package is included in the standalone bundle and becomes
  // resolvable from pdfjs's location. Also stamp globalThis ourselves as a
  // belt-and-braces fallback in case pdfjs's require resolution fails in
  // the traced layout.
  try {
    const canvas = (await import("@napi-rs/canvas")) as unknown as {
      DOMMatrix?: typeof DOMMatrix;
      ImageData?: typeof ImageData;
      Path2D?: typeof Path2D;
    };
    const g = globalThis as Record<string, unknown>;
    if (!g.DOMMatrix && canvas.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix;
    if (!g.ImageData && canvas.ImageData) g.ImageData = canvas.ImageData;
    if (!g.Path2D && canvas.Path2D) g.Path2D = canvas.Path2D;
  } catch {
    // If canvas isn't available, pdfjs will emit warnings and may still work
    // for pure text extraction on simple PDFs.
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Force-include the worker in the Next file trace. We don't actually spawn
  // a Worker thread — we hand pdfjs the module's URL via workerSrc so its
  // fake-worker loader can resolve it in the traced standalone bundle.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  try {
    const workerUrl = await import.meta.resolve?.(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
    );
    if (workerUrl && pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
  } catch {
    // resolve() may not be available on all runtimes; pdfjs will fall back
    // to its default relative path which is also now in the trace.
  }

  const data = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to parse PDF: ${msg}`);
  }

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // content.items is TextItem[] with a `str` field. Join with spaces and
    // break lines when the y-position changes (approximation: rely on
    // `hasEOL` where available).
    const parts: string[] = [];
    let prevY: number | null = null;
    for (const item of content.items as Array<{
      str: string;
      hasEOL?: boolean;
      transform?: number[];
    }>) {
      const y = item.transform ? item.transform[5] : null;
      if (prevY !== null && y !== null && Math.abs(y - prevY) > 2) {
        parts.push("\n");
      }
      parts.push(item.str);
      if (item.hasEOL) parts.push("\n");
      if (y !== null) prevY = y;
    }
    pageTexts.push(parts.join(" "));
  }

  const text = cleanText(pageTexts.join("\n\n"));
  if (text.length === 0) {
    throw new Error(
      "PDF contained no extractable text (likely a scanned image — try a text-based PDF or paste the content manually)",
    );
  }
  return { text, warnings };
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

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { config } from "../config.js";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

const SIGNATURE_PATH = "/app/assets/signature.png";
const SIGNATURE_WIDTH_PX = 240;
const SIGNATURE_HEIGHT_PX = 96;

export interface RenderLetterInput {
  company: string;
  role: string;
  bodyText: string;
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60) || "letter";
}

function bodyParagraphs(bodyText: string): Paragraph[] {
  const blocks = bodyText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const source = blocks.length > 0 ? blocks : [""];
  return source.map(
    (block) =>
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: block, font: "Calibri", size: 22 }),
        ],
      }),
  );
}

async function buildDocxBuffer(input: RenderLetterInput): Promise<Buffer> {
  const signatureBytes = await readFile(SIGNATURE_PATH);

  const recipient = new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: `${input.company} — ${input.role}`,
        font: "Calibri",
        size: 22,
      }),
    ],
  });

  const signOff = new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: "Best,", font: "Calibri", size: 22 })],
  });

  const signatureImg = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new ImageRun({
        type: "png",
        data: signatureBytes,
        transformation: {
          width: SIGNATURE_WIDTH_PX,
          height: SIGNATURE_HEIGHT_PX,
        },
      }),
    ],
  });

  const doc = new Document({
    creator: "scanner-worker",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          recipient,
          ...bodyParagraphs(input.bodyText),
          signOff,
          signatureImg,
        ],
      },
    ],
  });
  // HeightRule is imported solely to keep the docx peer-dep reference stable.
  void HeightRule;

  return Packer.toBuffer(doc) as unknown as Promise<Buffer>;
}

/**
 * Render a cover letter to PDF using docx + LibreOffice headless.
 * Returns the absolute path to the rendered PDF inside LETTERS_DIR.
 */
export async function renderLetterPdf(
  input: RenderLetterInput,
): Promise<string> {
  const lettersDir = config.LETTERS_DIR;
  await mkdir(lettersDir, { recursive: true });

  const base = `${sanitizeForFilename(input.company)}_${sanitizeForFilename(
    input.role,
  )}_${randomUUID().slice(0, 8)}`;
  const docxPath = path.join(lettersDir, `${base}.docx`);
  const pdfPath = path.join(lettersDir, `${base}.pdf`);

  const docxBuffer = await buildDocxBuffer(input);
  await writeFile(docxPath, docxBuffer);

  logger.debug({ docxPath }, "wrote docx, invoking soffice");
  await execFileAsync(
    "soffice",
    ["--headless", "--convert-to", "pdf", "--outdir", lettersDir, docxPath],
    { timeout: 60_000 },
  );

  return pdfPath;
}

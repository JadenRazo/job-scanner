// Render tailored resume + cover letter markdown into ATS-friendly DOCX
// binaries, then convert each DOCX to PDF with headless LibreOffice.
//
// ATS-friendliness notes:
// - Single column. No tables, no text boxes, no images, no columns.
// - Liberation Sans (Arial-metric-compatible) body, 11pt, single-line spacing.
// - Section headings are ALL CAPS at 12pt bold with a thin bottom border —
//   standard recruiter-grep-friendly layout.
// - Bullets use the plain bullet glyph. Keyword density is preserved because
//   we emit every token from the source markdown directly as text runs.
// - PDF is produced by LibreOffice Writer from the same DOCX so the text
//   layer matches exactly and is searchable by every ATS.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";

const BODY_FONT = "Liberation Sans"; // ships with the fonts-liberation apt pkg, metric-compatible with Arial
const BODY_SIZE = 22; // half-points → 11pt
const NAME_SIZE = 32; // 16pt
const SECTION_SIZE = 24; // 12pt
const ROLE_SIZE = 22; // 11pt
const SMALL_SIZE = 20; // 10pt

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

export interface ResumeDoc {
  name: string;
  tagline: string | null;
  contactLines: string[]; // lines between name/tagline and the first section
  sections: ResumeSection[];
}

export interface ResumeSection {
  heading: string;
  blocks: ResumeBlock[];
}

export type ResumeBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "role"; title: string; meta: string | null };

/**
 * Strip inline markdown we don't want to render literally. We keep text
 * simple — bold/italic don't survive most ATS parsers reliably anyway.
 */
function cleanInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function isBullet(line: string): boolean {
  return /^\s*(?:[-•*+])\s+/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-•*+])\s+/, "");
}

export function parseResumeMarkdown(md: string): ResumeDoc {
  const rawLines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  // Skip leading blank lines.
  while (i < rawLines.length && rawLines[i].trim() === "") i++;

  // The Claude prompt locks in `# Name` as the first non-blank line.
  let name = "";
  if (i < rawLines.length && /^#\s+/.test(rawLines[i])) {
    name = cleanInline(rawLines[i].replace(/^#\s+/, ""));
    i++;
  }

  // Optional single-line tagline (non-heading, non-blank) immediately after.
  let tagline: string | null = null;
  while (i < rawLines.length && rawLines[i].trim() === "") i++;
  if (
    i < rawLines.length &&
    rawLines[i].trim() !== "" &&
    !/^#{1,6}\s/.test(rawLines[i]) &&
    !isBullet(rawLines[i])
  ) {
    // Could be a tagline OR the first line of contact info. We treat a line
    // that contains no "|" separator and is short as a tagline.
    const candidate = cleanInline(rawLines[i]);
    if (!candidate.includes("|") && candidate.length < 80) {
      tagline = candidate;
      i++;
    }
  }

  // Contact lines until we hit the first ## heading or a blank run.
  const contactLines: string[] = [];
  while (i < rawLines.length && !/^##\s/.test(rawLines[i])) {
    const t = rawLines[i].trim();
    if (t !== "") contactLines.push(cleanInline(t));
    i++;
  }

  // Sections.
  const sections: ResumeSection[] = [];
  while (i < rawLines.length) {
    const line = rawLines[i];
    const match = line.match(/^##\s+(.+)$/);
    if (!match) {
      i++;
      continue;
    }
    const heading = cleanInline(match[1]).toUpperCase();
    i++;
    const blocks: ResumeBlock[] = [];
    while (i < rawLines.length && !/^##\s/.test(rawLines[i])) {
      const current = rawLines[i];
      const trimmed = current.trim();
      if (trimmed === "") {
        i++;
        continue;
      }
      if (/^###\s+/.test(current)) {
        const roleTitle = cleanInline(current.replace(/^###\s+/, ""));
        // Claude's prompt yields the role title on one line, followed by a
        // meta line (employer / dates / location). Capture the next non-blank
        // line as meta if it isn't a heading or bullet.
        let meta: string | null = null;
        let j = i + 1;
        while (j < rawLines.length && rawLines[j].trim() === "") j++;
        if (
          j < rawLines.length &&
          !/^#{1,6}\s/.test(rawLines[j]) &&
          !isBullet(rawLines[j])
        ) {
          meta = cleanInline(rawLines[j]);
          i = j + 1;
        } else {
          i++;
        }
        blocks.push({ kind: "role", title: roleTitle, meta });
        continue;
      }
      if (isBullet(current)) {
        blocks.push({ kind: "bullet", text: cleanInline(stripBullet(current)) });
        i++;
        continue;
      }
      blocks.push({ kind: "paragraph", text: cleanInline(trimmed) });
      i++;
    }
    sections.push({ heading, blocks });
  }

  return { name, tagline, contactLines, sections };
}

// ---------------------------------------------------------------------------
// DOCX emission
// ---------------------------------------------------------------------------

function nameParagraph(name: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [
      new TextRun({
        text: name.toUpperCase(),
        bold: true,
        size: NAME_SIZE,
        font: BODY_FONT,
      }),
    ],
  });
}

function taglineParagraph(tagline: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({
        text: tagline,
        size: BODY_SIZE,
        font: BODY_FONT,
      }),
    ],
  });
}

function contactParagraph(line: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({
        text: line,
        size: SMALL_SIZE,
        font: BODY_FONT,
      }),
    ],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 80 },
    border: {
      bottom: {
        color: "000000",
        space: 2,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    children: [
      new TextRun({
        text,
        bold: true,
        size: SECTION_SIZE,
        font: BODY_FONT,
      }),
    ],
  });
}

function roleHeading(title: string, meta: string | null): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({
      spacing: { before: 100, after: 0 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: ROLE_SIZE,
          font: BODY_FONT,
        }),
      ],
    }),
  ];
  if (meta) {
    paras.push(
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({
            text: meta,
            italics: true,
            size: SMALL_SIZE,
            font: BODY_FONT,
          }),
        ],
      }),
    );
  }
  return paras;
}

function bulletParagraph(text: string): Paragraph {
  // Use our own numbering so we don't depend on a global style.
  return new Paragraph({
    spacing: { before: 0, after: 40 },
    numbering: { reference: "resume-bullets", level: 0 },
    children: [
      new TextRun({
        text,
        size: BODY_SIZE,
        font: BODY_FONT,
      }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 80 },
    children: [
      new TextRun({
        text,
        size: BODY_SIZE,
        font: BODY_FONT,
      }),
    ],
  });
}

export async function renderResumeDocx(
  md: string,
  applicantName: string,
): Promise<Buffer> {
  const doc = parseResumeMarkdown(md);
  const name = doc.name || applicantName || "Resume";

  const children: Paragraph[] = [];
  children.push(nameParagraph(name));
  if (doc.tagline) children.push(taglineParagraph(doc.tagline));
  for (const line of doc.contactLines) {
    children.push(contactParagraph(line));
  }

  for (const section of doc.sections) {
    children.push(sectionHeading(section.heading));
    for (const block of section.blocks) {
      if (block.kind === "role") {
        children.push(...roleHeading(block.title, block.meta));
      } else if (block.kind === "bullet") {
        children.push(bulletParagraph(block.text));
      } else {
        children.push(bodyParagraph(block.text));
      }
    }
  }

  const document = new Document({
    creator: name,
    title: `${name} — Resume`,
    description: "Tailored resume",
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 240 },
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: BODY_SIZE },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5in
          },
        },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(document);
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// Cover letter
// ---------------------------------------------------------------------------

function letterParagraphs(md: string): Paragraph[] {
  const blocks = md
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return blocks.map((block) => {
    const text = block
      .split("\n")
      .map((l) => cleanInline(l.trim()))
      .join(" ");
    return new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 200 },
      children: [
        new TextRun({ text, size: BODY_SIZE, font: BODY_FONT }),
      ],
    });
  });
}

export async function renderLetterDocx(
  md: string,
  applicantName: string,
  applicantEmail: string | null,
  jobTitle: string,
  companyName: string,
): Promise<Buffer> {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const header: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: applicantName || "",
          bold: true,
          size: BODY_SIZE,
          font: BODY_FONT,
        }),
      ],
    }),
  ];
  if (applicantEmail) {
    header.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: applicantEmail,
            size: SMALL_SIZE,
            font: BODY_FONT,
          }),
        ],
      }),
    );
  }
  header.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 240, after: 200 },
      children: [
        new TextRun({ text: today, size: BODY_SIZE, font: BODY_FONT }),
      ],
    }),
  );
  header.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Re: ${jobTitle} — ${companyName}`,
          bold: true,
          size: BODY_SIZE,
          font: BODY_FONT,
        }),
      ],
    }),
  );

  const document = new Document({
    creator: applicantName || "Applicant",
    title: `${applicantName || "Applicant"} — Cover Letter — ${companyName}`,
    description: "Cover letter",
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: BODY_SIZE },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 }, // 0.75in
          },
        },
        children: [...header, ...letterParagraphs(md)],
      },
    ],
  });

  const buf = await Packer.toBuffer(document);
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// DOCX → PDF via headless LibreOffice
// ---------------------------------------------------------------------------

function runSoffice(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("soffice", args, { cwd });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`soffice exited ${code}: ${stderr.slice(0, 500)}`));
      }
    });
    setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("soffice timed out"));
    }, 60_000);
  });
}

export async function docxToPdf(docxBytes: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "resume-"));
  const docxPath = join(dir, "in.docx");
  const pdfPath = join(dir, "in.pdf");
  try {
    await writeFile(docxPath, docxBytes);
    await runSoffice(
      [
        "--headless",
        "--norestore",
        "--nologo",
        "--nofirststartwizard",
        "-env:UserInstallation=file:///tmp/lo-profile-" + process.pid,
        "--convert-to",
        "pdf",
        "--outdir",
        dir,
        docxPath,
      ],
      dir,
    );
    const pdf = await readFile(pdfPath);
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

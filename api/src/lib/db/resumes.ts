// Query helpers for the resumes table. Kept in a single module so both the
// server-component page and the API route handlers share a single source of
// truth for shapes and sort order.

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { resumes, type Resume } from "@/lib/db/schema-readonly";

// Full Resume row minus the heavy bytea column. All public query helpers
// return this shape so the bytes never leak into list/CRUD JSON payloads;
// getResumeOriginal() is the only way to read them back.
export type ResumeRow = Omit<Resume, "originalBytes">;

function stripBytes(row: Resume): ResumeRow {
  const { originalBytes: _omit, ...rest } = row;
  void _omit;
  return rest;
}

export interface ResumeListItem {
  id: number;
  label: string;
  isActive: boolean;
  charCount: number;
  originalFilename: string | null;
  originalMime: string | null;
  hasOriginal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResumeDetail {
  id: number;
  label: string;
  contentMd: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function listResumes(): Promise<ResumeListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: resumes.id,
      label: resumes.label,
      isActive: resumes.isActive,
      charCount: sql<number>`length(${resumes.contentMd})`.mapWith(Number),
      originalFilename: resumes.originalFilename,
      originalMime: resumes.originalMime,
      // Avoid selecting the bytea column — it's potentially huge.
      hasOriginal: sql<boolean>`(${resumes.originalBytes} IS NOT NULL)`.mapWith(
        Boolean,
      ),
      createdAt: resumes.createdAt,
      updatedAt: resumes.updatedAt,
    })
    .from(resumes)
    .orderBy(desc(resumes.isActive), desc(resumes.createdAt));
  return rows;
}

export async function getResume(id: number): Promise<ResumeDetail | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: resumes.id,
      label: resumes.label,
      contentMd: resumes.contentMd,
      isActive: resumes.isActive,
      createdAt: resumes.createdAt,
      updatedAt: resumes.updatedAt,
    })
    .from(resumes)
    .where(eq(resumes.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createResume(input: {
  label: string;
  contentMd: string;
  originalFilename?: string | null;
  originalMime?: string | null;
  originalBytes?: Buffer | null;
}): Promise<ResumeRow> {
  const db = getDb();
  const existingCount = await db
    .select({ c: sql<number>`count(*)`.mapWith(Number) })
    .from(resumes);
  const shouldActivate = (existingCount[0]?.c ?? 0) === 0;
  const [row] = await db
    .insert(resumes)
    .values({
      label: input.label,
      contentMd: input.contentMd,
      isActive: shouldActivate,
      originalFilename: input.originalFilename ?? null,
      originalMime: input.originalMime ?? null,
      originalBytes: input.originalBytes ?? null,
    })
    .returning();
  return stripBytes(row);
}

export async function getResumeOriginal(
  id: number,
): Promise<{ filename: string; mime: string; bytes: Buffer } | null> {
  const db = getDb();
  const rows = await db
    .select({
      originalFilename: resumes.originalFilename,
      originalMime: resumes.originalMime,
      originalBytes: resumes.originalBytes,
    })
    .from(resumes)
    .where(eq(resumes.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || !row.originalBytes || row.originalBytes.length === 0) {
    return null;
  }
  return {
    filename: row.originalFilename ?? `resume-${id}`,
    mime: row.originalMime ?? "application/octet-stream",
    bytes: row.originalBytes,
  };
}

export async function updateResume(
  id: number,
  patch: { label?: string; contentMd?: string },
): Promise<ResumeRow | null> {
  const db = getDb();
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label !== undefined) values.label = patch.label;
  if (patch.contentMd !== undefined) values.contentMd = patch.contentMd;
  const [row] = await db
    .update(resumes)
    .set(values)
    .where(eq(resumes.id, id))
    .returning();
  return row ? stripBytes(row) : null;
}

export async function deleteResume(
  id: number,
): Promise<{ deleted: ResumeRow; promoted: ResumeRow | null } | null> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(resumes)
      .where(eq(resumes.id, id))
      .returning();
    if (!deleted) return null;

    let promoted: Resume | null = null;
    if (deleted.isActive) {
      const [next] = await tx
        .select()
        .from(resumes)
        .orderBy(desc(resumes.updatedAt))
        .limit(1);
      if (next) {
        const [updated] = await tx
          .update(resumes)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(resumes.id, next.id))
          .returning();
        promoted = updated;
      }
    }
    return {
      deleted: stripBytes(deleted),
      promoted: promoted ? stripBytes(promoted) : null,
    };
  });
}

export async function activateResume(id: number): Promise<ResumeRow | null> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const [exists] = await tx
      .select({ id: resumes.id })
      .from(resumes)
      .where(eq(resumes.id, id))
      .limit(1);
    if (!exists) return null;

    await tx
      .update(resumes)
      .set({ isActive: false })
      .where(and(ne(resumes.id, id), eq(resumes.isActive, true)));

    const [activated] = await tx
      .update(resumes)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(resumes.id, id))
      .returning();
    return activated ? stripBytes(activated) : null;
  });
}

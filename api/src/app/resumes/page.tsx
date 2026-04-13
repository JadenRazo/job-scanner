import Link from "next/link";
import { requireAuth } from "@/lib/auth/server";
import { listResumes } from "@/lib/db/resumes";
import { ResumesManager } from "./resumes-manager";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  await requireAuth();
  const resumes = await listResumes();

  const initial = resumes.map((r) => ({
    id: r.id,
    label: r.label,
    isActive: r.isActive,
    charCount: r.charCount,
    originalFilename: r.originalFilename,
    originalMime: r.originalMime,
    hasOriginal: r.hasOriginal,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          &larr; Back
        </Link>
        <h1 className="text-4xl font-bold tracking-tight">Resumes</h1>
        <p className="text-slate-600">
          Manage multiple resume variants. Exactly one can be active at a
          time &mdash; the active resume is used when scoring jobs and
          generating letters.
        </p>
      </header>

      <ResumesManager initial={initial} />
    </main>
  );
}

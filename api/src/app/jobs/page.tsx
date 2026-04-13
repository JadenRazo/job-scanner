import Link from "next/link";
import { requireAuth } from "@/lib/auth/server";
import { listRecommendedJobs } from "@/lib/db/jobs";
import { JobsManager } from "./jobs-manager";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  await requireAuth();

  // Server-render the first page with defaults so the UI is immediately
  // useful without a client round-trip. The client component refetches on
  // filter/sort changes.
  const initial = await listRecommendedJobs({ sort: "posted_desc", limit: 100 });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          &larr; Back
        </Link>
        <h1 className="text-4xl font-bold tracking-tight">Recommended Jobs</h1>
        <p className="text-slate-600">
          Jobs scored at or above your threshold ({initial.scoreThreshold}).
          Filter by title, sort by recency or score, and mark what you&rsquo;ve
          applied to.
        </p>
      </header>

      <JobsManager
        initial={initial.jobs}
        initialTotal={initial.total}
        scoreThreshold={initial.scoreThreshold}
      />
    </main>
  );
}

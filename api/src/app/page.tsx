import Link from "next/link";
import { requireAuth } from "@/lib/auth/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { SignOutButton } from "./sign-out-button";

export default async function HomePage() {
  // Lazily create the admin user on first request if the DB is empty.
  await ensureBootstrap();

  const session = await requireAuth();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6">
      <h1 className="text-4xl font-bold tracking-tight">Job Scanner</h1>
      <p className="text-slate-600">
        Signed in as{" "}
        <span className="font-medium text-slate-900">{session.user.email}</span>
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href="/jobs"
          className="text-sm font-medium text-slate-900 underline underline-offset-4 hover:text-slate-600"
        >
          Recommended jobs &rarr;
        </Link>
        <Link
          href="/resumes"
          className="text-sm font-medium text-slate-900 underline underline-offset-4 hover:text-slate-600"
        >
          Manage resumes &rarr;
        </Link>
      </div>
      <SignOutButton />
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type JobStatus = "new" | "reviewed" | "applied" | "archived" | "rejected";
type JobSort = "posted_desc" | "score_desc" | "title_asc";

interface RecommendedJob {
  matchId: number;
  jobId: number;
  title: string;
  companyId: number;
  companyName: string;
  location: string | null;
  remote: boolean | null;
  seniority: string | null;
  postedAt: string | null;
  url: string;
  score: number | null;
  rationale: string | null;
  skills: string[];
  gaps: string[];
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

interface ApiOk<T> {
  success: true;
  data: T;
}
interface ApiErr {
  success: false;
  error: string;
}
type ApiEnvelope<T> = ApiOk<T> | ApiErr;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.success) throw new Error(body.error);
  return body.data;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function scoreColor(score: number | null): string {
  if (score == null) return "bg-slate-200 text-slate-700";
  if (score >= 85) return "bg-emerald-100 text-emerald-800";
  if (score >= 70) return "bg-sky-100 text-sky-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}

const STATUS_TABS: { value: JobStatus | "active"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "applied", label: "Applied" },
  { value: "archived", label: "Archived" },
  { value: "rejected", label: "Rejected" },
];

interface Props {
  initial: RecommendedJob[];
  initialTotal: number;
  scoreThreshold: number;
}

export function JobsManager({ initial, initialTotal, scoreThreshold }: Props) {
  const [jobs, setJobs] = useState<RecommendedJob[]>(initial);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<JobSort>("posted_desc");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "active">(
    "active",
  );
  const [minScore, setMinScore] = useState<number>(scoreThreshold);

  // Debounce the title search so we aren't hammering the API on each keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      params.set("sort", sort);
      params.set("minScore", String(minScore));
      if (statusFilter === "active") {
        params.set("statuses", "new,reviewed,applied");
      } else {
        params.set("statuses", statusFilter);
      }
      params.set("limit", "200");
      const data = await apiFetch<{
        jobs: RecommendedJob[];
        total: number;
        scoreThreshold: number;
      }>(`/api/jobs?${params.toString()}`);
      setJobs(data.jobs);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, sort, minScore, statusFilter]);

  // Skip the initial fetch — the server already rendered it with defaults.
  // Any filter change after mount triggers a refetch.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void load();
  }, [load]);

  const updateStatus = useCallback(
    async (matchId: number, status: JobStatus) => {
      // Optimistic update.
      setJobs((prev) =>
        prev.map((j) => (j.matchId === matchId ? { ...j, status } : j)),
      );
      try {
        await apiFetch(`/api/jobs/${matchId}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        // If we're on a filter that now excludes this job, drop it locally.
        if (statusFilter === "active" && (status === "archived" || status === "rejected")) {
          setJobs((prev) => prev.filter((j) => j.matchId !== matchId));
        } else if (statusFilter !== "active" && statusFilter !== status) {
          setJobs((prev) => prev.filter((j) => j.matchId !== matchId));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
        void load();
      }
    },
    [load, statusFilter],
  );

  const shownCount = jobs.length;
  const summary = useMemo(() => {
    if (loading) return "Loading…";
    if (shownCount === total) return `${total} job${total === 1 ? "" : "s"}`;
    return `${shownCount} of ${total}`;
  }, [loading, shownCount, total]);

  return (
    <section className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label className="sr-only" htmlFor="job-search">
              Search title
            </label>
            <input
              id="job-search"
              type="search"
              placeholder="Search by title…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600" htmlFor="job-sort">
              Sort
            </label>
            <select
              id="job-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as JobSort)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="posted_desc">Recently posted</option>
              <option value="score_desc">Highest score</option>
              <option value="title_asc">Title A–Z</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600" htmlFor="job-min-score">
              Min score {minScore}
            </label>
            <input
              id="job-min-score"
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-32"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                statusFilter === tab.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
              )}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto flex items-center text-xs text-slate-500">
            {summary}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* List */}
      {jobs.length === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          No jobs match these filters yet. Try lowering the minimum score or
          clearing the search.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => {
            const isOpen = expanded === job.matchId;
            return (
              <li
                key={job.matchId}
                className="rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : job.matchId)}
                  className="flex w-full items-start gap-4 px-4 py-3 text-left"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                      scoreColor(job.score),
                    )}
                  >
                    {job.score ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {job.title}
                      </span>
                      <span className="text-xs text-slate-500">
                        {job.companyName}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>{job.location ?? "—"}</span>
                      {job.remote && <span>Remote</span>}
                      {job.seniority && <span>{job.seniority}</span>}
                      <span>{timeAgo(job.postedAt)}</span>
                      <span className="uppercase tracking-wide">
                        {job.status}
                      </span>
                    </div>
                  </div>
                  <span className="mt-1 shrink-0 text-xs text-slate-400">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-4 text-sm">
                    {job.rationale && (
                      <p className="mb-3 text-slate-700">{job.rationale}</p>
                    )}
                    {job.skills.length > 0 && (
                      <div className="mb-2 flex flex-wrap items-center gap-1">
                        <span className="mr-1 text-xs font-medium text-slate-500">
                          Skills:
                        </span>
                        {job.skills.map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {job.gaps.length > 0 && (
                      <div className="mb-3 flex flex-wrap items-center gap-1">
                        <span className="mr-1 text-xs font-medium text-slate-500">
                          Gaps:
                        </span>
                        {job.gaps.map((g) => (
                          <span
                            key={g}
                            className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Open posting ↗
                      </a>
                      {job.status !== "applied" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(job.matchId, "applied")}
                          className="rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Mark applied
                        </button>
                      )}
                      {job.status !== "reviewed" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(job.matchId, "reviewed")}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Mark reviewed
                        </button>
                      )}
                      {job.status !== "archived" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(job.matchId, "archived")}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Archive
                        </button>
                      )}
                      {job.status !== "rejected" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(job.matchId, "rejected")}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

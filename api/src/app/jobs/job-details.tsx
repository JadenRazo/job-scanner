"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ArtifactStatus = "idle" | "queued" | "running" | "ready" | "error";

interface HiringManagerGuess {
  title: string;
  why: string;
  searchQuery: string;
  confidence: "high" | "medium" | "low";
  linkedinSearchUrl: string;
}

interface JobArtifacts {
  matchId: number;
  managersStatus: ArtifactStatus;
  managersError: string | null;
  managersUpdatedAt: string | null;
  managers: {
    guesses: HiringManagerGuess[];
    notes: string;
    company: string;
    generatedAt: string;
  } | null;
  tailorStatus: ArtifactStatus;
  tailorError: string | null;
  tailorUpdatedAt: string | null;
  tailoredResumeMd: string | null;
  tailoredLetterMd: string | null;
}

interface ApiOk<T> {
  success: true;
  data: T;
}
interface ApiErr {
  success: false;
  error: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as ApiOk<T> | ApiErr;
  if (!body.success) throw new Error(body.error);
  return body.data;
}

interface Props {
  matchId: number;
  title: string;
  rationale: string | null;
  skills: string[];
  gaps: string[];
  url: string;
  status: string;
  onStatusChange: (next: "applied" | "reviewed" | "archived" | "rejected") => void;
}

type Tab = "overview" | "managers" | "tailor";

const CONFIDENCE_PILL: Record<HiringManagerGuess["confidence"], string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function JobDetails({
  matchId,
  title,
  rationale,
  skills,
  gaps,
  url,
  status,
  onStatusChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [artifacts, setArtifacts] = useState<JobArtifacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchArtifacts = useCallback(async () => {
    try {
      const data = await apiFetch<JobArtifacts>(`/api/jobs/${matchId}/artifacts`);
      setArtifacts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [matchId]);

  useEffect(() => {
    void fetchArtifacts();
  }, [fetchArtifacts]);

  // Poll every 2s while anything is in flight.
  useEffect(() => {
    if (!artifacts) return;
    const pending =
      artifacts.managersStatus === "queued" ||
      artifacts.managersStatus === "running" ||
      artifacts.tailorStatus === "queued" ||
      artifacts.tailorStatus === "running";
    if (!pending) return;
    pollingRef.current = setTimeout(() => {
      void fetchArtifacts();
    }, 2000);
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [artifacts, fetchArtifacts]);

  const trigger = useCallback(
    async (kind: "managers" | "tailor") => {
      setError(null);
      try {
        await apiFetch(`/api/jobs/${matchId}/${kind}`, { method: "POST" });
        await fetchArtifacts();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start");
      }
    },
    [matchId, fetchArtifacts],
  );

  const managersBusy =
    artifacts?.managersStatus === "queued" ||
    artifacts?.managersStatus === "running";
  const tailorBusy =
    artifacts?.tailorStatus === "queued" ||
    artifacts?.tailorStatus === "running";

  return (
    <div className="border-t border-slate-100">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-3 pt-2">
        {(
          [
            ["overview", "Overview"],
            ["managers", "Hiring managers"],
            ["tailor", "Tailor"],
          ] as [Tab, string][]
        ).map(([val, label]) => {
          const active = tab === val;
          const hasSignal =
            (val === "managers" &&
              (artifacts?.managersStatus === "ready" || managersBusy)) ||
            (val === "tailor" &&
              (artifacts?.tailorStatus === "ready" || tailorBusy));
          return (
            <button
              key={val}
              type="button"
              onClick={() => setTab(val)}
              className={cn(
                "relative rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {label}
              {hasSignal && (
                <span
                  className={cn(
                    "ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle",
                    managersBusy || tailorBusy
                      ? "bg-amber-400 animate-pulse"
                      : "bg-emerald-500",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="px-4 py-4 text-sm">
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {tab === "overview" && (
          <OverviewTab
            rationale={rationale}
            skills={skills}
            gaps={gaps}
            url={url}
            status={status}
            onStatusChange={onStatusChange}
          />
        )}

        {tab === "managers" && (
          <ManagersTab
            artifacts={artifacts}
            onGenerate={() => trigger("managers")}
            onRegenerate={() => trigger("managers")}
          />
        )}

        {tab === "tailor" && (
          <TailorTab
            title={title}
            artifacts={artifacts}
            onGenerate={() => trigger("tailor")}
            onRegenerate={() => trigger("tailor")}
          />
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  rationale,
  skills,
  gaps,
  url,
  status,
  onStatusChange,
}: Pick<Props, "rationale" | "skills" | "gaps" | "url" | "status" | "onStatusChange">) {
  return (
    <div>
      {rationale && <p className="mb-3 text-slate-700">{rationale}</p>}
      {skills.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs font-medium text-slate-500">Skills:</span>
          {skills.map((s) => (
            <span
              key={s}
              className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
            >
              {s}
            </span>
          ))}
        </div>
      )}
      {gaps.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs font-medium text-slate-500">Gaps:</span>
          {gaps.map((g) => (
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
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Open posting ↗
        </a>
        {status !== "applied" && (
          <button
            type="button"
            onClick={() => onStatusChange("applied")}
            className="rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Mark applied
          </button>
        )}
        {status !== "reviewed" && (
          <button
            type="button"
            onClick={() => onStatusChange("reviewed")}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Mark reviewed
          </button>
        )}
        {status !== "archived" && (
          <button
            type="button"
            onClick={() => onStatusChange("archived")}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Archive
          </button>
        )}
        {status !== "rejected" && (
          <button
            type="button"
            onClick={() => onStatusChange("rejected")}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Reject
          </button>
        )}
      </div>
    </div>
  );
}

function StatusNote({
  status,
  error,
}: {
  status: ArtifactStatus;
  error: string | null;
}) {
  if (status === "queued")
    return (
      <p className="text-xs text-slate-500">
        Queued. The worker will pick this up within a few seconds.
      </p>
    );
  if (status === "running")
    return (
      <p className="text-xs text-slate-500">
        Generating… Claude runs with a human-pacing delay, expect 30-90 seconds.
      </p>
    );
  if (status === "error")
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
        {error ?? "Generation failed. Click retry."}
      </p>
    );
  return null;
}

function ManagersTab({
  artifacts,
  onGenerate,
  onRegenerate,
}: {
  artifacts: JobArtifacts | null;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  if (!artifacts) {
    return <p className="text-xs text-slate-500">Loading…</p>;
  }
  const { managersStatus, managersError, managers } = artifacts;
  const busy = managersStatus === "queued" || managersStatus === "running";

  if (managersStatus === "idle" && !managers) {
    return (
      <div>
        <p className="mb-3 text-slate-600">
          Predict likely hiring-manager titles for this role and generate
          one-click LinkedIn search links to find real people.
        </p>
        <button
          type="button"
          onClick={onGenerate}
          className="rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Predict hiring managers
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusNote status={managersStatus} error={managersError} />

      {managers && managers.guesses.length > 0 && (
        <ul className="flex flex-col gap-2">
          {managers.guesses.map((g, i) => (
            <li
              key={`${g.title}-${i}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {g.title}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        CONFIDENCE_PILL[g.confidence],
                      )}
                    >
                      {g.confidence}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{g.why}</p>
                </div>
                <a
                  href={g.linkedinSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border border-sky-600 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
                >
                  Search on LinkedIn ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {managers?.notes && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
          {managers.notes}
        </p>
      )}

      {(managersStatus === "ready" || managersStatus === "error") && (
        <div>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {managersStatus === "error" ? "Retry" : "Regenerate"}
          </button>
        </div>
      )}
    </div>
  );
}

function TailorTab({
  title,
  artifacts,
  onGenerate,
  onRegenerate,
}: {
  title: string;
  artifacts: JobArtifacts | null;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  if (!artifacts) {
    return <p className="text-xs text-slate-500">Loading…</p>;
  }
  const { tailorStatus, tailorError, tailoredResumeMd, tailoredLetterMd } =
    artifacts;
  const busy = tailorStatus === "queued" || tailorStatus === "running";
  const hasContent = Boolean(tailoredResumeMd && tailoredLetterMd);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  if (tailorStatus === "idle" && !hasContent) {
    return (
      <div>
        <p className="mb-3 text-slate-600">
          Generate a resume and cover letter tailored to this posting using
          your active resume and profile. Output is written to read as human,
          not as AI.
        </p>
        <button
          type="button"
          onClick={onGenerate}
          className="rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Generate tailored resume &amp; letter
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StatusNote status={tailorStatus} error={tailorError} />

      {hasContent && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white">
            <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Tailored resume
              </h3>
              <div className="flex gap-1.5">
                <CopyButton text={tailoredResumeMd ?? ""} label="Copy" />
                <button
                  type="button"
                  onClick={() =>
                    download(`resume-${slug}.md`, tailoredResumeMd ?? "")
                  }
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Download .md
                </button>
              </div>
            </header>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap px-3 py-3 font-mono text-[11.5px] leading-relaxed text-slate-800">
              {tailoredResumeMd}
            </pre>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Cover letter
              </h3>
              <div className="flex gap-1.5">
                <CopyButton text={tailoredLetterMd ?? ""} label="Copy" />
                <button
                  type="button"
                  onClick={() =>
                    download(`letter-${slug}.md`, tailoredLetterMd ?? "")
                  }
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Download .md
                </button>
              </div>
            </header>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap px-3 py-3 font-serif text-[13px] leading-relaxed text-slate-800">
              {tailoredLetterMd}
            </pre>
          </section>
        </div>
      )}

      {(tailorStatus === "ready" || tailorStatus === "error") && (
        <div>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {tailorStatus === "error" ? "Retry" : "Regenerate"}
          </button>
        </div>
      )}
    </div>
  );
}

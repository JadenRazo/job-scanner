"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ResumeListItem {
  id: number;
  label: string;
  isActive: boolean;
  charCount: number;
  originalFilename: string | null;
  originalMime: string | null;
  hasOriginal: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ResumeDetail {
  id: number;
  label: string;
  contentMd: string;
  isActive: boolean;
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

async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
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

async function apiUpload<T>(url: string, form: FormData): Promise<T> {
  // NOTE: do NOT set content-type — the browser must set the multipart
  // boundary itself.
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.success) throw new Error(body.error);
  return body.data;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ResumesManager({ initial }: { initial: ResumeListItem[] }) {
  const [list, setList] = useState<ResumeListItem[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | "new" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ResumeDetail | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ resumes: ResumeListItem[] }>(
        "/api/resumes",
      );
      setList(data.resumes);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  async function handleActivate(id: number) {
    setError(null);
    setPendingId(id);
    try {
      await apiFetch(`/api/resumes/${id}/activate`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(id: number, label: string) {
    if (!window.confirm(`Delete resume "${label}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    setPendingId(id);
    try {
      await apiFetch(`/api/resumes/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  async function handleEditOpen(id: number) {
    setError(null);
    try {
      const data = await apiFetch<{ resume: ResumeDetail }>(
        `/api/resumes/${id}`,
      );
      setEditDraft(data.resume);
      setEditingId(id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleEditSave() {
    if (!editDraft) return;
    setError(null);
    setPendingId(editDraft.id);
    try {
      await apiFetch(`/api/resumes/${editDraft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: editDraft.label,
          contentMd: editDraft.contentMd,
        }),
      });
      setEditingId(null);
      setEditDraft(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list.map((r) =>
          editingId === r.id && editDraft ? (
            <EditCard
              key={r.id}
              draft={editDraft}
              pending={pendingId === r.id}
              onChange={setEditDraft}
              onCancel={() => {
                setEditingId(null);
                setEditDraft(null);
              }}
              onSave={handleEditSave}
            />
          ) : (
            <ResumeCard
              key={r.id}
              resume={r}
              pending={pendingId === r.id}
              onActivate={() => handleActivate(r.id)}
              onEdit={() => handleEditOpen(r.id)}
              onDelete={() => handleDelete(r.id, r.label)}
            />
          ),
        )}

        {showAdd ? (
          <AddCard
            pending={pendingId === "new"}
            onCancel={() => setShowAdd(false)}
            onCreate={async (label, contentMd) => {
              setError(null);
              setPendingId("new");
              try {
                await apiFetch("/api/resumes", {
                  method: "POST",
                  body: JSON.stringify({ label, contentMd }),
                });
                setShowAdd(false);
                await refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setPendingId(null);
              }
            }}
            onUpload={async (label, file) => {
              setError(null);
              setPendingId("new");
              try {
                const form = new FormData();
                form.set("label", label);
                form.set("file", file);
                await apiUpload("/api/resumes/upload", form);
                setShowAdd(false);
                await refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setPendingId(null);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-slate-500 transition hover:border-slate-500 hover:text-slate-900"
          >
            <span className="text-2xl">+</span>
            <span className="mt-1 text-sm font-medium">Add new resume</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ResumeCard({
  resume,
  pending,
  onActivate,
  onEdit,
  onDelete,
}: {
  resume: ResumeListItem;
  pending: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  void nowTick;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
        resume.isActive && "ring-2 ring-slate-900",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-xl font-semibold tracking-tight">
            {resume.label}
          </h2>
          {resume.hasOriginal && resume.originalFilename && (
            <span className="truncate text-xs text-slate-500">
              {resume.originalFilename}
            </span>
          )}
        </div>
        {resume.isActive && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            Active
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-slate-500">
        <span>{resume.charCount.toLocaleString()} characters</span>
        <span>Updated {timeAgo(resume.updatedAt)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={onActivate}
          disabled={resume.isActive || pending}
        >
          Activate
        </Button>
        <Button variant="secondary" onClick={onEdit} disabled={pending}>
          Edit
        </Button>
        {resume.hasOriginal && (
          <a
            href={`/api/resumes/${resume.id}/download`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
          >
            Download
          </a>
        )}
        <Button
          variant="secondary"
          onClick={onDelete}
          disabled={pending}
          className="border-red-300 text-red-700 hover:bg-red-50"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function EditCard({
  draft,
  pending,
  onChange,
  onCancel,
  onSave,
}: {
  draft: ResumeDetail;
  pending: boolean;
  onChange: (d: ResumeDetail) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm md:col-span-2">
      <h2 className="text-lg font-semibold">Edit resume</h2>
      <Input
        value={draft.label}
        onChange={(e) => onChange({ ...draft, label: e.target.value })}
        placeholder="Label"
        disabled={pending}
      />
      <textarea
        value={draft.contentMd}
        onChange={(e) => onChange({ ...draft, contentMd: e.target.value })}
        rows={20}
        disabled={pending}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:opacity-60"
      />
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AddCard({
  pending,
  onCancel,
  onCreate,
  onUpload,
}: {
  pending: boolean;
  onCancel: () => void;
  onCreate: (label: string, contentMd: string) => void;
  onUpload: (label: string, file: File) => void;
}) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [label, setLabel] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">New resume</h2>
        <div
          role="tablist"
          className="flex gap-1 rounded-md bg-slate-100 p-1 text-xs font-medium"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            onClick={() => setMode("upload")}
            className={cn(
              "rounded px-3 py-1 transition",
              mode === "upload"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Upload file
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "paste"}
            onClick={() => setMode("paste")}
            className={cn(
              "rounded px-3 py-1 transition",
              mode === "paste"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Paste text
          </button>
        </div>
      </div>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. Backend-focused)"
        disabled={pending}
      />
      {mode === "upload" ? (
        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
            disabled={pending}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-slate-50 disabled:opacity-60"
          />
          <p className="text-xs text-slate-500">
            PDF, DOCX, Markdown, or plain text. Max 5 MB. Label is optional —
            defaults to the filename.
          </p>
        </div>
      ) : (
        <textarea
          value={contentMd}
          onChange={(e) => setContentMd(e.target.value)}
          rows={20}
          placeholder="# Your resume in Markdown"
          disabled={pending}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:opacity-60"
        />
      )}
      <div className="flex gap-2">
        {mode === "upload" ? (
          <Button
            onClick={() => {
              if (!file) return;
              onUpload(label.trim(), file);
            }}
            disabled={pending || !file}
          >
            {pending ? "Uploading…" : "Upload"}
          </Button>
        ) : (
          <Button
            onClick={() => onCreate(label.trim(), contentMd)}
            disabled={pending || !label.trim() || !contentMd.trim()}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

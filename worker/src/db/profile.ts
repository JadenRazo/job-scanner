import { pool } from "./client.js";

export interface ScorableResume {
  id: number;
  label: string;
  contentMd: string;
  isActive: boolean;
}

/**
 * Load every resume that has non-empty content, for Stage 2 multi-resume
 * scoring. Active resume first (breaks ties when scores are equal and is
 * the default for Stage 3 cover letter drafting). Returns an empty array
 * when there's nothing to score against — callers MUST skip Stage 2 in
 * that case.
 */
export async function loadScorableResumes(): Promise<ScorableResume[]> {
  const { rows } = await pool.query<{
    id: string;
    label: string;
    content_md: string;
    is_active: boolean;
  }>(
    `SELECT id, label, content_md, is_active
       FROM resumes
      WHERE length(trim(content_md)) > 0
      ORDER BY is_active DESC, updated_at DESC`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    label: r.label,
    contentMd: r.content_md,
    isActive: r.is_active,
  }));
}

export interface Profile {
  fullName: string | null;
  contactEmail: string | null;
  resumeMd: string;
  titleAllow: string[];
  titleDeny: string[];
  seniorityAllow: string[];
  locationsAllow: string[];
  remoteOnly: boolean;
  scoreThreshold: number;
  paused: boolean;
  discordWebhook: string | null;
  /** Freeform "what kinds of roles am I targeting" — injected into the Stage 2 prompt. */
  targetRoles: string;
}

interface ProfileRow {
  full_name: string | null;
  contact_email: string | null;
  resume_md: string;
  title_allow: string[];
  title_deny: string[];
  seniority_allow: string[];
  locations_allow: string[];
  remote_only: boolean;
  score_threshold: number;
  paused: boolean;
  discord_webhook: string | null;
  target_roles: string;
}

export async function loadProfile(): Promise<Profile> {
  const { rows } = await pool.query<ProfileRow>(
    `SELECT full_name, contact_email, resume_md, title_allow, title_deny,
            seniority_allow, locations_allow, remote_only, score_threshold,
            paused, discord_webhook, target_roles
       FROM profile WHERE id = 1`,
  );
  if (rows.length === 0) throw new Error("profile row missing — db/schema.sql not applied?");
  const r = rows[0];
  return {
    fullName: r.full_name,
    contactEmail: r.contact_email,
    resumeMd: r.resume_md,
    titleAllow: r.title_allow,
    titleDeny: r.title_deny,
    seniorityAllow: r.seniority_allow,
    locationsAllow: r.locations_allow,
    remoteOnly: r.remote_only,
    scoreThreshold: r.score_threshold,
    paused: r.paused,
    discordWebhook: r.discord_webhook,
    targetRoles: r.target_roles ?? "",
  };
}

export async function setResumeMd(md: string): Promise<void> {
  await pool.query(
    `UPDATE profile SET resume_md = $1, updated_at = NOW() WHERE id = 1`,
    [md],
  );
}

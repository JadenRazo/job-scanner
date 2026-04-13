import { pool } from "./client.js";

export interface ActiveResume {
  id: number;
  label: string;
  contentMd: string;
}

/**
 * Load the currently-active resume from the resumes table. Returns null when
 * there is no active resume — callers must treat this as "nothing to score
 * against" and skip Stage 2.
 */
export async function loadActiveResume(): Promise<ActiveResume | null> {
  const { rows } = await pool.query<{
    id: string;
    label: string;
    content_md: string;
  }>(
    `SELECT id, label, content_md FROM resumes WHERE is_active = TRUE LIMIT 1`,
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: Number(r.id), label: r.label, contentMd: r.content_md };
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

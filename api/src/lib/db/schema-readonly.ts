// Read-only Drizzle mappings for the domain tables owned by raw SQL
// (/root/job-scanner/db/schema.sql).
//
// IMPORTANT: This file is intentionally NOT referenced by drizzle.config.ts.
// drizzle-kit must never attempt to create, alter, or drop these tables —
// they're managed by the database bootstrap migration.
//
// Import these definitions directly from this file in query code, e.g.:
//   import { rawJobs, jobMatches } from "@/lib/db/schema-readonly";

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  integer,
  smallint,
  bigserial,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";

// drizzle-orm pg-core has no built-in bytea — the standard pattern is a
// customType that marshals Buffer <-> bytea. node-postgres returns Buffer
// for bytea columns natively.
export const bytea = customType<{
  data: Buffer;
  driverData: Buffer;
  default: false;
}>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string") {
      // Postgres sometimes returns bytea as hex-encoded `\x...` text when the
      // session bytea_output is set to 'hex'. node-postgres normally decodes
      // this to Buffer for us, but handle the string path just in case.
      if (value.startsWith("\\x")) {
        return Buffer.from(value.slice(2), "hex");
      }
      return Buffer.from(value);
    }
    throw new Error("bytea: unexpected driver value type");
  },
});

const nowTz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`);

// ---------------------------------------------------------------------------
// profile — single-row user config (id = 1)
// ---------------------------------------------------------------------------
export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  fullName: text("full_name"),
  contactEmail: text("contact_email"),
  resumeMd: text("resume_md").notNull().default(""),
  resumePdfPath: text("resume_pdf_path"),
  titleAllow: text("title_allow").array().notNull().default(sql`'{}'::text[]`),
  titleDeny: text("title_deny").array().notNull().default(sql`'{}'::text[]`),
  titleBoost: text("title_boost").array().notNull().default(sql`'{}'::text[]`),
  seniorityAllow: text("seniority_allow")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  locationsAllow: text("locations_allow")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  remoteOnly: boolean("remote_only").notNull().default(false),
  scoreThreshold: smallint("score_threshold").notNull().default(70),
  paused: boolean("paused").notNull().default(false),
  discordWebhook: text("discord_webhook"),
  updatedAt: nowTz("updated_at"),
});

// ---------------------------------------------------------------------------
// companies
// ---------------------------------------------------------------------------
export const companies = pgTable(
  "companies",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    ats: text("ats").notNull(),
    slug: text("slug").notNull(),
    workdaySite: text("workday_site"),
    enabled: boolean("enabled").notNull().default(true),
    tier: smallint("tier").notNull().default(3),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true, mode: "date" }),
    createdAt: nowTz("created_at"),
  },
  (t) => [
    uniqueIndex("companies_ats_slug_key").on(t.ats, t.slug),
    index("companies_enabled_idx").on(t.enabled),
    index("companies_tier_enabled_idx").on(t.tier, t.enabled),
  ],
);

// ---------------------------------------------------------------------------
// scrape_runs
// ---------------------------------------------------------------------------
export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: bigint("company_id", { mode: "number" }).references(
      () => companies.id,
      { onDelete: "cascade" },
    ),
    startedAt: nowTz("started_at"),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    ok: boolean("ok"),
    error: text("error"),
    found: integer("found").notNull().default(0),
    newCount: integer("new_count").notNull().default(0),
  },
  (t) => [index("scrape_runs_company_idx").on(t.companyId, t.startedAt)],
);

// ---------------------------------------------------------------------------
// raw_jobs
// ---------------------------------------------------------------------------
export const rawJobs = pgTable(
  "raw_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: bigint("company_id", { mode: "number" })
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    ats: text("ats").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    remote: boolean("remote"),
    seniority: text("seniority"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }),
    url: text("url").notNull(),
    descriptionMd: text("description_md"),
    rawJson: jsonb("raw_json"),
    country: text("country"),
    sourceCompanyName: text("source_company_name"),
    firstSeenAt: nowTz("first_seen_at"),
    lastSeenAt: nowTz("last_seen_at"),
  },
  (t) => [
    uniqueIndex("raw_jobs_ats_external_id_key").on(t.ats, t.externalId),
    index("raw_jobs_company_idx").on(t.companyId),
    index("raw_jobs_posted_idx").on(t.postedAt),
    index("raw_jobs_country_idx").on(t.country),
  ],
);

// ---------------------------------------------------------------------------
// job_matches
// ---------------------------------------------------------------------------
export const matchStatus = pgEnum("match_status", [
  "new",
  "reviewed",
  "applied",
  "archived",
  "rejected",
]);

export const jobMatches = pgTable(
  "job_matches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    jobId: bigint("job_id", { mode: "number" })
      .references(() => rawJobs.id, { onDelete: "cascade" })
      .notNull(),
    stage1Pass: boolean("stage1_pass").notNull().default(false),
    stage2Score: smallint("stage2_score"),
    stage2Rationale: text("stage2_rationale"),
    stage2Skills: jsonb("stage2_skills"),
    stage2Gaps: jsonb("stage2_gaps"),
    stage3Analysis: text("stage3_analysis"),
    stage3LetterMd: text("stage3_letter_md"),
    letterPdfPath: text("letter_pdf_path"),
    modelCostCents: integer("model_cost_cents").notNull().default(0),
    status: matchStatus("status").notNull().default("new"),
    hiringManagerGuesses: jsonb("hiring_manager_guesses"),
    managersStatus: text("managers_status").notNull().default("idle"),
    managersError: text("managers_error"),
    managersUpdatedAt: timestamp("managers_updated_at", {
      withTimezone: true,
      mode: "date",
    }),
    tailoredResumeMd: text("tailored_resume_md"),
    tailoredLetterMd: text("tailored_letter_md"),
    tailoredResumeDocx: bytea("tailored_resume_docx"),
    tailoredResumePdf: bytea("tailored_resume_pdf"),
    tailoredLetterDocx: bytea("tailored_letter_docx"),
    tailoredLetterPdf: bytea("tailored_letter_pdf"),
    tailorStatus: text("tailor_status").notNull().default("idle"),
    tailorError: text("tailor_error"),
    tailorUpdatedAt: timestamp("tailor_updated_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: nowTz("created_at"),
    updatedAt: nowTz("updated_at"),
  },
  (t) => [
    uniqueIndex("job_matches_job_id_key").on(t.jobId),
    index("job_matches_score_idx").on(t.stage2Score),
    index("job_matches_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// resumes — multi-resume management (managed by /root/job-scanner/db/001-resumes.sql)
// ---------------------------------------------------------------------------
export const resumes = pgTable(
  "resumes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    label: text("label").notNull(),
    contentMd: text("content_md").notNull().default(""),
    isActive: boolean("is_active").notNull().default(false),
    originalFilename: text("original_filename"),
    originalMime: text("original_mime"),
    originalBytes: bytea("original_bytes"),
    createdAt: nowTz("created_at"),
    updatedAt: nowTz("updated_at"),
  },
  (t) => [
    // Partial unique index (is_active) WHERE is_active = TRUE — declared in SQL,
    // mirrored here as a non-partial uniqueIndex binding is not possible with
    // drizzle-orm pg-core. Query code relies on the DB to enforce it.
    index("resumes_is_active_idx").on(t.isActive),
  ],
);

export type Resume = typeof resumes.$inferSelect;

// ---------------------------------------------------------------------------
// job_feedback
// ---------------------------------------------------------------------------
export const jobFeedback = pgTable(
  "job_feedback",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    matchId: bigint("match_id", { mode: "number" })
      .references(() => jobMatches.id, { onDelete: "cascade" })
      .notNull(),
    thumbs: smallint("thumbs").notNull(),
    note: text("note"),
    createdAt: nowTz("created_at"),
  },
  (t) => [index("job_feedback_match_idx").on(t.matchId)],
);

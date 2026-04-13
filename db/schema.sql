-- job-scanner schema (Postgres 17)
-- Applied once against database `jobscanner` owned by role `jobscanner`.
-- Better Auth tables are managed by the scanner-api via drizzle push;
-- this file only defines the domain tables.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- profile: single-row user config (resume text + matching preferences)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  full_name        TEXT,
  contact_email    TEXT,
  resume_md        TEXT NOT NULL DEFAULT '',
  resume_pdf_path  TEXT,
  title_allow      TEXT[] NOT NULL DEFAULT '{}',
  title_deny       TEXT[] NOT NULL DEFAULT '{}',
  seniority_allow  TEXT[] NOT NULL DEFAULT '{}',
  locations_allow  TEXT[] NOT NULL DEFAULT '{}',
  remote_only      BOOLEAN NOT NULL DEFAULT FALSE,
  score_threshold  SMALLINT NOT NULL DEFAULT 70,
  paused           BOOLEAN NOT NULL DEFAULT FALSE,
  discord_webhook  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- companies: target employers + ATS mapping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  domain           TEXT,
  ats              TEXT NOT NULL CHECK (ats IN (
                     'greenhouse','lever','ashby','workday','smartrecruiters',
                     'jazzhr','bamboohr','icims'
                   )),
  slug             TEXT NOT NULL,
  workday_site     TEXT,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  last_scanned_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ats, slug)
);

CREATE INDEX IF NOT EXISTS companies_enabled_idx ON companies (enabled) WHERE enabled;

-- ---------------------------------------------------------------------------
-- scrape_runs: per-company per-pass log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_runs (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  ok           BOOLEAN,
  error        TEXT,
  found        INTEGER NOT NULL DEFAULT 0,
  new_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS scrape_runs_company_idx ON scrape_runs (company_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- raw_jobs: deduped job postings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_jobs (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ats             TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  title           TEXT NOT NULL,
  location        TEXT,
  remote          BOOLEAN,
  seniority       TEXT,
  posted_at       TIMESTAMPTZ,
  url             TEXT NOT NULL,
  description_md  TEXT,
  raw_json        JSONB,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ats, external_id)
);

CREATE INDEX IF NOT EXISTS raw_jobs_company_idx ON raw_jobs (company_id);
CREATE INDEX IF NOT EXISTS raw_jobs_posted_idx  ON raw_jobs (posted_at DESC);

-- ---------------------------------------------------------------------------
-- job_matches: one row per (job, pipeline-pass). Status is user-facing.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE match_status AS ENUM ('new','reviewed','applied','archived','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS job_matches (
  id                  BIGSERIAL PRIMARY KEY,
  job_id              BIGINT NOT NULL REFERENCES raw_jobs(id) ON DELETE CASCADE,
  stage1_pass         BOOLEAN NOT NULL DEFAULT FALSE,
  stage2_score        SMALLINT,
  stage2_rationale    TEXT,
  stage2_skills       JSONB,
  stage2_gaps         JSONB,
  stage3_analysis     TEXT,
  stage3_letter_md    TEXT,
  letter_pdf_path     TEXT,
  model_cost_cents    INTEGER NOT NULL DEFAULT 0,
  status              match_status NOT NULL DEFAULT 'new',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id)
);

CREATE INDEX IF NOT EXISTS job_matches_score_idx  ON job_matches (stage2_score DESC);
CREATE INDEX IF NOT EXISTS job_matches_status_idx ON job_matches (status);

-- ---------------------------------------------------------------------------
-- job_feedback: thumbs + notes from the reviewer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_feedback (
  id          BIGSERIAL PRIMARY KEY,
  match_id    BIGINT NOT NULL REFERENCES job_matches(id) ON DELETE CASCADE,
  thumbs      SMALLINT NOT NULL CHECK (thumbs IN (-1, 0, 1)),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_feedback_match_idx ON job_feedback (match_id);

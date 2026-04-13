-- Phase 3.6: multi-resume support.
-- Adds a resumes table and migrates the existing single-field resume from
-- profile.resume_md into a seeded "Default" row. Idempotent.

CREATE TABLE IF NOT EXISTS resumes (
  id          BIGSERIAL PRIMARY KEY,
  label       TEXT NOT NULL,
  content_md  TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: at most one row with is_active = TRUE.
CREATE UNIQUE INDEX IF NOT EXISTS resumes_only_one_active
  ON resumes (is_active) WHERE is_active = TRUE;

-- Seed: move the current profile.resume_md into a resumes row on first run.
-- We look for an existing "Default" row to stay idempotent.
DO $$
DECLARE
  existing_count INTEGER;
  src_md TEXT;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM resumes;
  IF existing_count = 0 THEN
    SELECT resume_md INTO src_md FROM profile WHERE id = 1;
    INSERT INTO resumes (label, content_md, is_active)
    VALUES ('Default', COALESCE(src_md, ''), TRUE);
  END IF;
END $$;

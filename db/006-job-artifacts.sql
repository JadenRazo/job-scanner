-- On-demand artifacts for a job match: hiring-manager title guesses, a
-- tailored resume, and a tailored cover letter. All produced asynchronously
-- by the worker via BullMQ; the api surfaces status + content.
--
-- Idempotent (safe to re-apply). No data migration needed.

ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS hiring_manager_guesses jsonb,
  ADD COLUMN IF NOT EXISTS managers_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS managers_error text,
  ADD COLUMN IF NOT EXISTS managers_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS tailored_resume_md text,
  ADD COLUMN IF NOT EXISTS tailored_letter_md text,
  ADD COLUMN IF NOT EXISTS tailor_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS tailor_error text,
  ADD COLUMN IF NOT EXISTS tailor_updated_at timestamptz;

-- Allowed values: idle | queued | running | ready | error
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_matches_managers_status_chk'
  ) THEN
    ALTER TABLE job_matches
      ADD CONSTRAINT job_matches_managers_status_chk
      CHECK (managers_status IN ('idle','queued','running','ready','error'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_matches_tailor_status_chk'
  ) THEN
    ALTER TABLE job_matches
      ADD CONSTRAINT job_matches_tailor_status_chk
      CHECK (tailor_status IN ('idle','queued','running','ready','error'));
  END IF;
END $$;

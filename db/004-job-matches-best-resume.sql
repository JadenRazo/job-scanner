-- Phase 3.9: multi-resume matching.
-- Store which resume produced the best Stage 2 score so the dashboard can
-- show it and Stage 3 (cover letter drafting) can use the winning resume
-- as its source. ON DELETE SET NULL so deleting a resume doesn't cascade
-- and nuke historical match rows.

ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS best_resume_id BIGINT
    REFERENCES resumes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS job_matches_best_resume_idx
  ON job_matches (best_resume_id)
  WHERE best_resume_id IS NOT NULL;

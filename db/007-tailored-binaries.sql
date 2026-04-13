-- Rendered binary artifacts for the tailored resume and cover letter.
-- DOCX is produced in-process via the `docx` npm library; PDF is produced
-- by converting the DOCX with headless LibreOffice (soffice --headless
-- --convert-to pdf). Both are ATS-friendly single-column layouts.
--
-- Binaries live on job_matches (one row per match) because they're small
-- (~20-40 KB) and always read alongside the match record. Idempotent.

ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS tailored_resume_docx bytea,
  ADD COLUMN IF NOT EXISTS tailored_resume_pdf  bytea,
  ADD COLUMN IF NOT EXISTS tailored_letter_docx bytea,
  ADD COLUMN IF NOT EXISTS tailored_letter_pdf  bytea;

-- Phase: resume file upload support.
-- Adds columns to store the original uploaded file (PDF/DOCX/etc) alongside
-- the extracted text that lives in content_md. Nullable so existing rows and
-- the paste-markdown flow remain valid. Idempotent.

ALTER TABLE resumes ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS original_mime     TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS original_bytes    BYTEA;

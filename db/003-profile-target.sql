-- Phase 3.8: add a free-form target_roles field to the profile so the Stage 2
-- Haiku prompt can bias scoring toward a specific track (e.g. internships in
-- SRE / Platform / Cloud / SysAdmin) without having to re-derive intent from
-- the resume alone. Idempotent.

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS target_roles TEXT NOT NULL DEFAULT '';

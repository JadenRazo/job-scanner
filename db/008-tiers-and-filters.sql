-- Phase 5 — scale the scraper:
--   * Tiered company roster: scrape signal-dense employers more often.
--   * Country-aware stage-1 filter: US / CA / remote only.
--   * Aggregator sources: one synthetic row per source, actual employer
--     name lives on raw_jobs.source_company_name.
--   * title_boost for jr/internship ordering preference.
--
-- Idempotent. Safe to re-apply.

-- ---------------------------------------------------------------------------
-- companies.tier — 1 = highest signal (DevTools/Observability), 7 = aggregator.
-- ---------------------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS tier SMALLINT NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS companies_tier_enabled_idx
  ON companies (tier, enabled) WHERE enabled;

-- ---------------------------------------------------------------------------
-- Expand ats CHECK: add Big Tech custom + aggregator sources.
-- Postgres doesn't let you ALTER a CHECK in place — drop + re-add.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'companies_ats_check'
  ) THEN
    ALTER TABLE companies DROP CONSTRAINT companies_ats_check;
  END IF;
END $$;

ALTER TABLE companies
  ADD CONSTRAINT companies_ats_check CHECK (ats IN (
    -- Standard ATS platforms with public APIs
    'greenhouse','lever','ashby','workday','smartrecruiters',
    'jazzhr','bamboohr','icims',
    -- Big Tech custom careers APIs (one "company" row per employer)
    'google','meta','amazon','apple','microsoft',
    -- Aggregator sources (one synthetic "company" row per source;
    -- raw_jobs.source_company_name carries the real employer)
    'remoteok','remotive','yc_wafs','hn_hiring','simplifyjobs'
  ));

-- ---------------------------------------------------------------------------
-- raw_jobs additions: country + aggregator source employer name.
-- ---------------------------------------------------------------------------
ALTER TABLE raw_jobs
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS source_company_name TEXT;

CREATE INDEX IF NOT EXISTS raw_jobs_country_idx ON raw_jobs (country);

-- ---------------------------------------------------------------------------
-- profile.title_boost — titles containing one of these bubble up in Stage-1
-- ORDER BY so jr/internship roles are scored first under quota pressure.
-- Separate from title_allow because it must NOT filter out mid-level roles
-- the user also wants to see.
-- ---------------------------------------------------------------------------
ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS title_boost TEXT[] NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- Re-seed profile filters for Jaden's intern/jr/associate skill lane +
-- DevOps/SRE/Platform/Security/Cloud role variety + US/CA scope.
-- UPDATE so existing row (id=1) gets the new defaults; safe to re-run.
-- ---------------------------------------------------------------------------
UPDATE profile SET
  title_allow = ARRAY[
    -- Engineering-surface roles
    'Engineer','Developer','Software','SWE','Programmer',
    -- Specializations the user explicitly wants
    'Full Stack','Fullstack','Full-Stack','Backend','Back-End','Back End',
    'Frontend','Front-End','Front End','Web',
    'Platform','Infrastructure','Infra','DevOps','DevEx','Developer Experience',
    'SRE','Site Reliability','Reliability','Production','Systems',
    'Cloud','Kubernetes','Containers',
    'Observability','Monitoring','Telemetry',
    'Security Engineer','AppSec','Application Security','Product Security',
    'Data Platform','Data Engineer','ML Platform','ML Ops','MLOps','AI Platform',
    'API','Services','Microservices',
    'Automation','Tooling','Build','Release','Deployment',
    -- Network / systems adjacency (matches user's Security+ skillset)
    'Network Engineer','Systems Engineer','SysOps','IT',
    'Support Engineer','Technical Support',
    -- Technical Program / rotational — OK for new grads
    'Associate Engineer','Associate Software','Associate Developer'
  ]::text[],

  title_deny = ARRAY[
    -- Seniority gates — user is jr/intern, filter these out hard
    'Senior','Sr.','Sr ','SNR','SR.',
    'Staff','Principal','Distinguished','Fellow',
    'Architect','Lead','Tech Lead','Team Lead',
    -- Management / exec
    'Manager','Managing','Supervisor','Supervisor''s',
    'Director','Head of','Head Of',
    'VP','Vice President','SVP','EVP','Chief','CTO','CIO','CEO','CPO','CMO','CFO','CSO','CISO',
    'Executive','President','Partner','Owner',
    -- Consulting / sales / marketing — not engineering
    'Salesforce Developer','Salesforce Administrator',
    'Account Executive','Sales Engineer','Sales Representative',
    'Marketing','Recruiter','Recruiting','Talent Acquisition',
    'Customer Success','Customer Support Representative',
    -- Law / finance / HR
    'Attorney','Lawyer','Paralegal','Counsel','Legal',
    'Accountant','Financial Analyst','Auditor','Bookkeeper',
    'Human Resources','HR Business Partner','People Operations Manager',
    -- Non-software trades
    'Mechanical Engineer','Electrical Engineer','Civil Engineer','Chemical Engineer',
    'Biomedical Engineer','Industrial Engineer','Aerospace Engineer','Structural Engineer',
    'Hardware Engineer','RF Engineer','FPGA','ASIC','Silicon','Semiconductor',
    'Validation Engineer','Process Engineer','Manufacturing Engineer','Test Technician',
    'Construction','Welder','HVAC','Mechanic','Electrician','Plumber',
    'Physician','Nurse','Pharmacist','Therapist','Dental',
    'Janitor','Driver','Warehouse','Cashier','Barista','Server','Housekeeping',
    -- Seniority disambiguation: "Senior" variants with punctuation/spacing
    'Seniority','Seasoned'
  ]::text[],

  title_boost = ARRAY[
    -- What the user IS — bubble these to the top of Stage-1 ordering
    'Intern','Internship','Co-op','Co op','Coop',
    'Junior','Jr.','Jr ','Entry Level','Entry-Level','Entry level',
    'New Grad','New-Grad','NewGrad','New Graduate',
    'University Grad','University Graduate','Graduate Program','Grad Program',
    'Early Career','Early-Career','Apprentice','Apprenticeship',
    'Associate','Trainee','Rotation','Rotational',
    -- Level indicators in titles
    'Engineer I','Engineer 1','Developer I','Developer 1','Software I',
    'Level 1','L1 ','L2 ','L3 '
  ]::text[],

  locations_allow = ARRAY[
    -- Empty means "no location constraint" (old behavior). The new country
    -- filter in db/matches.ts handles US/CA selection via r.country,
    -- so we leave this empty for now and let SQL do the geo work.
  ]::text[],

  remote_only = FALSE,  -- remote becomes an ORDER BY boost, not a filter

  -- Lower threshold to see more variety while tuning; raise back to 70+
  -- once the pipeline is saturated with quality matches.
  score_threshold = 55,

  updated_at = NOW()
WHERE id = 1;

-- ---------------------------------------------------------------------------
-- Tier the existing seeded companies.
-- Tier 1: DevTools / Observability / Infra (user's highest-signal track)
-- Tier 2: AI/ML, hot startups
-- Tier 3: Fintech, modern SaaS
-- Tier 4: Big Tech (Workday-heavy, high-volume)
-- Aggregator/Custom rows get tiered when seeded in 009.
-- ---------------------------------------------------------------------------
UPDATE companies SET tier = 1 WHERE slug IN (
  'hashicorp','datadog','cloudflare','snowflakecomputing','databricks',
  'gitlab','vercel','samsara','twilio','scaleai'
) AND ats = 'greenhouse';

UPDATE companies SET tier = 1 WHERE slug IN (
  'openai','posthog','linear','supabase','anysphere'
) AND ats = 'ashby';

UPDATE companies SET tier = 2 WHERE slug IN (
  'anthropic','replit','mistral'
) OR slug IN ('scaleai') AND ats = 'greenhouse';

UPDATE companies SET tier = 2 WHERE ats = 'lever' AND slug IN ('mistral','netflix','palantir');

UPDATE companies SET tier = 3 WHERE slug IN (
  'stripe','plaid','brex','chime','gusto','robinhood','coinbase','ramp'
);

UPDATE companies SET tier = 3 WHERE slug IN (
  'airbnb','doordash','instacart','dropbox','reddit','pinterest','figma','discord'
);

UPDATE companies SET tier = 4 WHERE ats = 'workday';

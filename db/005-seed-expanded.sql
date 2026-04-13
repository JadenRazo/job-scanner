-- Phase 4 seed: expand beyond the initial 10 Greenhouse boards to cover
-- more internship + infra-heavy companies across Greenhouse, Lever, Ashby,
-- and Workday. Idempotent via the (ats, slug) unique constraint.
--
-- Slug research notes:
--   * Broken slugs are cheap (they return 0 jobs with a 404 warn log) —
--     we add speculative entries and let the scraper verify at runtime.
--   * Workday entries need both `slug` (tenant) and `workday_site`.
--   * The old Greenhouse rows that return 0 (Notion/Ramp/Retool) are left
--     alone; no harm, they'll continue returning 0 until we disable them.

-- ---------------------------------------------------------------------------
-- Greenhouse expansion — infra-heavy + internship-friendly companies
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled) VALUES
  ('Databricks',     'databricks.com',    'greenhouse', 'databricks',        TRUE),
  ('Coinbase',       'coinbase.com',      'greenhouse', 'coinbase',          TRUE),
  ('DoorDash',       'doordash.com',      'greenhouse', 'doordash',          TRUE),
  ('Instacart',      'instacart.com',     'greenhouse', 'instacart',         TRUE),
  ('Plaid',          'plaid.com',         'greenhouse', 'plaid',             TRUE),
  ('Dropbox',        'dropbox.com',       'greenhouse', 'dropbox',           TRUE),
  ('Robinhood',      'robinhood.com',     'greenhouse', 'robinhood',         TRUE),
  ('Reddit',         'reddit.com',        'greenhouse', 'reddit',            TRUE),
  ('Pinterest',      'pinterest.com',     'greenhouse', 'pinterest',         TRUE),
  ('Chime',          'chime.com',         'greenhouse', 'chime',             TRUE),
  ('Brex',           'brex.com',          'greenhouse', 'brex',              TRUE),
  ('Gusto',          'gusto.com',         'greenhouse', 'gusto',             TRUE),
  ('HashiCorp',      'hashicorp.com',     'greenhouse', 'hashicorp',         TRUE),
  ('Samsara',        'samsara.com',       'greenhouse', 'samsara',           TRUE),
  ('Benchling',      'benchling.com',     'greenhouse', 'benchling',         TRUE),
  ('Scale AI',       'scale.com',         'greenhouse', 'scaleai',           TRUE),
  ('Cloudflare',     'cloudflare.com',    'greenhouse', 'cloudflare',        TRUE),
  ('Datadog',        'datadoghq.com',     'greenhouse', 'datadog',           TRUE),
  ('Snowflake',      'snowflake.com',     'greenhouse', 'snowflakecomputing',TRUE),
  ('Twilio',         'twilio.com',        'greenhouse', 'twilio',            TRUE)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Lever — smaller but includes several AI-lab / fintech boards
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled) VALUES
  ('Palantir',       'palantir.com',      'lever',      'palantir',          TRUE),
  ('Netflix',        'netflix.com',       'lever',      'netflix',           TRUE),
  ('Eventbrite',     'eventbrite.com',    'lever',      'eventbrite',        TRUE),
  ('Strava',         'strava.com',        'lever',      'strava',            TRUE),
  ('Mistral AI',     'mistral.ai',        'lever',      'mistral',           TRUE),
  ('Coda',           'coda.io',           'lever',      'coda',              TRUE),
  ('Rippling',       'rippling.com',      'lever',      'rippling',          TRUE),
  ('KeepTruckin',    'keeptruckin.com',   'lever',      'keeptruckin',       TRUE)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Ashby — modern AI / devtools companies
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled) VALUES
  ('OpenAI',         'openai.com',        'ashby',      'openai',            TRUE),
  ('PostHog',        'posthog.com',       'ashby',      'posthog',           TRUE),
  ('Replit',         'replit.com',        'ashby',      'replit',            TRUE),
  ('Linear',         'linear.app',        'ashby',      'linear',            TRUE),
  ('Supabase',       'supabase.com',      'ashby',      'supabase',          TRUE),
  ('Cursor',         'cursor.sh',         'ashby',      'anysphere',         TRUE),
  ('Ramp',           'ramp.com',          'ashby',      'ramp',              TRUE),
  ('Vapi',           'vapi.ai',           'ashby',      'vapi',              TRUE)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Workday — F500 tenants. Each needs both tenant (slug) + workday_site.
-- Host pod is assumed wd5 in the adapter; wd1 fallback is runtime.
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, workday_site, enabled) VALUES
  ('NVIDIA',         'nvidia.com',        'workday',    'nvidia',   'NVIDIAExternalCareerSite', TRUE),
  ('Salesforce',     'salesforce.com',    'workday',    'salesforce','External_Career_Site',    TRUE),
  ('Cisco',          'cisco.com',         'workday',    'cisco',    'at_cisco',                 TRUE),
  ('Workday',        'workday.com',       'workday',    'workday',  'Workday',                  TRUE)
ON CONFLICT (ats, slug) DO NOTHING;

-- Disable the companies from the Phase 2 seed that we proved are no longer
-- on Greenhouse (returned 0 on first scrape). They stay in the table for
-- history but won't waste HTTP calls next pass.
UPDATE companies SET enabled = FALSE
 WHERE ats = 'greenhouse' AND slug IN ('notion', 'ramp', 'retool');

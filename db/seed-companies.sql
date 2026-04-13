-- Phase 2 seed: 10 known-good Greenhouse public job boards.
-- Idempotent — re-running is safe thanks to the (ats, slug) unique constraint.

INSERT INTO companies (name, domain, ats, slug, enabled) VALUES
  ('Airbnb',    'airbnb.com',    'greenhouse', 'airbnb',    TRUE),
  ('Stripe',    'stripe.com',    'greenhouse', 'stripe',    TRUE),
  ('Figma',     'figma.com',     'greenhouse', 'figma',     TRUE),
  ('GitLab',    'gitlab.com',    'greenhouse', 'gitlab',    TRUE),
  ('Notion',    'notion.so',     'greenhouse', 'notion',    TRUE),
  ('Vercel',    'vercel.com',    'greenhouse', 'vercel',    TRUE),
  ('Ramp',      'ramp.com',      'greenhouse', 'ramp',      TRUE),
  ('Retool',    'retool.com',    'greenhouse', 'retool',    TRUE),
  ('Anthropic', 'anthropic.com', 'greenhouse', 'anthropic', TRUE),
  ('Discord',   'discord.com',   'greenhouse', 'discord',   TRUE)
ON CONFLICT (ats, slug) DO NOTHING;

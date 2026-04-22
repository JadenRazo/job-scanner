-- Phase 5 — massive roster expansion (~300 new rows).
-- Seeds are best-effort on the ATS/slug mapping; broken slugs return 0 with
-- a WARN log and cost nothing. Tiered so schedulers hit signal-dense
-- employers more often. Idempotent via (ats, slug) unique constraint.
--
-- Tiers:
--   1  Infra / DevTools / Observability      every  2h  (highest signal)
--   2  AI/ML labs + high-value scale-ups     every  4h
--   3  Fintech / Modern SaaS / Consumer      every  6h
--   4  Big Tech customs + F500 Workday       every  6h
--   5  Enterprise / Gaming / Media           every 12h
--   6  Fortune 500 non-tech / Consulting     every 24h
--   7  Aggregators (single-call, multi-co)   every  4h

-- ---------------------------------------------------------------------------
-- Tier 1 — Greenhouse: Infra / DevTools / Observability
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Confluent',          'confluent.io',      'greenhouse', 'confluent',          TRUE, 1),
  ('Elastic',            'elastic.co',        'greenhouse', 'elastic',            TRUE, 1),
  ('MongoDB',            'mongodb.com',       'greenhouse', 'mongodb',            TRUE, 1),
  ('Redis',              'redis.io',          'greenhouse', 'redis',              TRUE, 1),
  ('Fastly',             'fastly.com',        'greenhouse', 'fastly',             TRUE, 1),
  ('Netlify',            'netlify.com',       'greenhouse', 'netlify',            TRUE, 1),
  ('Sentry',             'sentry.io',         'greenhouse', 'sentry',             TRUE, 1),
  ('Temporal',           'temporal.io',       'greenhouse', 'temporaltechnologies', TRUE, 1),
  ('Airbyte',            'airbyte.com',       'greenhouse', 'airbyte',            TRUE, 1),
  ('Fivetran',           'fivetran.com',      'greenhouse', 'fivetran',           TRUE, 1),
  ('dbt Labs',           'getdbt.com',        'greenhouse', 'dbtlabs',            TRUE, 1),
  ('Hex',                'hex.tech',          'greenhouse', 'hex',                TRUE, 1),
  ('Grafana Labs',       'grafana.com',       'greenhouse', 'grafanalabs',        TRUE, 1),
  ('Chronosphere',       'chronosphere.io',   'greenhouse', 'chronosphere',       TRUE, 1),
  ('Honeycomb',          'honeycomb.io',      'greenhouse', 'honeycomb',          TRUE, 1),
  ('LaunchDarkly',       'launchdarkly.com',  'greenhouse', 'launchdarkly',       TRUE, 1),
  ('Pulumi',             'pulumi.com',        'greenhouse', 'pulumi',             TRUE, 1),
  ('CircleCI',           'circleci.com',      'greenhouse', 'circleci',           TRUE, 1),
  ('JFrog',              'jfrog.com',         'greenhouse', 'jfrog',              TRUE, 1),
  ('PagerDuty',          'pagerduty.com',     'greenhouse', 'pagerduty',          TRUE, 1),
  ('Sumo Logic',         'sumologic.com',     'greenhouse', 'sumologic',          TRUE, 1),
  ('Sysdig',             'sysdig.com',        'greenhouse', 'sysdig',             TRUE, 1),
  ('Harness',            'harness.io',        'greenhouse', 'harness',            TRUE, 1),
  ('Kong',               'konghq.com',        'greenhouse', 'kong',               TRUE, 1),
  ('Snyk',               'snyk.io',           'greenhouse', 'snyk',               TRUE, 1),
  ('Teleport',           'goteleport.com',    'greenhouse', 'teleport',           TRUE, 1),
  ('Wiz',                'wiz.io',            'greenhouse', 'wiz',                TRUE, 1),
  ('Tigera',             'tigera.io',         'greenhouse', 'tigera',             TRUE, 1),
  ('Chainguard',         'chainguard.dev',    'greenhouse', 'chainguard',         TRUE, 1),
  ('Tailscale',          'tailscale.com',     'greenhouse', 'tailscale',          TRUE, 1),
  ('Logz.io',            'logz.io',           'greenhouse', 'logzio',             TRUE, 1),
  ('Rollbar',            'rollbar.com',       'greenhouse', 'rollbar',            TRUE, 1),
  ('Bugsnag',            'bugsnag.com',       'greenhouse', 'bugsnag',            TRUE, 1),
  ('Aqua Security',      'aquasec.com',       'greenhouse', 'aquasecurity',       TRUE, 1),
  ('Lacework',           'lacework.com',      'greenhouse', 'lacework',           TRUE, 1),
  ('Orca Security',      'orca.security',     'greenhouse', 'orcasecurity',       TRUE, 1),
  ('StackHawk',          'stackhawk.com',     'greenhouse', 'stackhawk',          TRUE, 1),
  ('Veracode',           'veracode.com',      'greenhouse', 'veracode',           TRUE, 1),
  ('1Password',          '1password.com',     'greenhouse', '1password',          TRUE, 1),
  ('Vercel',             'vercel.com',        'greenhouse', 'vercel',             TRUE, 1),
  ('Replicated',         'replicated.com',    'greenhouse', 'replicated',         TRUE, 1),
  ('Spacelift',          'spacelift.io',      'greenhouse', 'spacelift',          TRUE, 1),
  ('Hasura',             'hasura.io',         'greenhouse', 'hasura',             TRUE, 1),
  ('Postman',            'postman.com',       'greenhouse', 'postman',            TRUE, 1),
  ('Cockroach Labs',     'cockroachlabs.com', 'greenhouse', 'cockroachlabs',      TRUE, 1),
  ('Yugabyte',           'yugabyte.com',      'greenhouse', 'yugabyte',           TRUE, 1),
  ('Neon',               'neon.tech',         'greenhouse', 'neon',               TRUE, 1)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 1 — Ashby: Modern DevTools / Cloud platforms
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Render',             'render.com',        'ashby', 'render',                  TRUE, 1),
  ('Railway',            'railway.app',       'ashby', 'railway',                 TRUE, 1),
  ('Fly.io',             'fly.io',            'ashby', 'flyio',                   TRUE, 1),
  ('Northflank',         'northflank.com',    'ashby', 'northflank',              TRUE, 1),
  ('Porter',             'porter.run',        'ashby', 'porter',                  TRUE, 1),
  ('Akuity',             'akuity.io',         'ashby', 'akuity',                  TRUE, 1),
  ('Buildkite',          'buildkite.com',     'ashby', 'buildkite',               TRUE, 1),
  ('Docker',             'docker.com',        'ashby', 'docker',                  TRUE, 1),
  ('env0',               'env0.com',          'ashby', 'env0',                    TRUE, 1),
  ('Loft Labs',          'loft.sh',           'ashby', 'loft',                    TRUE, 1),
  ('Solo.io',            'solo.io',           'ashby', 'soloio',                  TRUE, 1),
  ('Tetrate',            'tetrate.io',        'ashby', 'tetrate',                 TRUE, 1),
  ('Warp',               'warp.dev',          'ashby', 'warp',                    TRUE, 1),
  ('Neon',               'neon.tech',         'ashby', 'neontech',                TRUE, 1),
  ('Notion',             'notion.so',         'ashby', 'notion',                  TRUE, 2)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 1 — Lever: Infra / security
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Ubuntu (Canonical)', 'canonical.com',     'lever', 'canonical',               TRUE, 1),
  ('Elastic',            'elastic.co',        'lever', 'elastic',                 TRUE, 1)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 1 — Workday: Infra-heavy F500
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, workday_site, enabled, tier) VALUES
  ('Splunk',             'splunk.com',        'workday', 'cisco',        'at_cisco',                 TRUE, 1),
  ('New Relic',          'newrelic.com',      'workday', 'newrelic',     'newrelic',                 TRUE, 1),
  ('Dynatrace',          'dynatrace.com',     'workday', 'dynatrace',    'careers',                  TRUE, 1),
  ('Red Hat',            'redhat.com',        'workday', 'ibm',          'IBM',                      TRUE, 1),
  ('Broadcom',           'broadcom.com',      'workday', 'broadcom',     'External_Career',          TRUE, 1),
  ('Nutanix',            'nutanix.com',       'workday', 'nutanix',      'Nutanix_Careers',          TRUE, 1),
  ('HPE',                'hpe.com',           'workday', 'hpe',          'Jobsathpe',                TRUE, 1),
  ('Dell',               'dell.com',          'workday', 'dell',         'External',                 TRUE, 1)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 2 — Greenhouse: AI/ML labs + scale-ups
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Hugging Face',       'huggingface.co',    'greenhouse', 'huggingface',        TRUE, 2),
  ('Cohere',             'cohere.com',        'greenhouse', 'cohere',             TRUE, 2),
  ('Perplexity',         'perplexity.ai',     'greenhouse', 'perplexity',         TRUE, 2),
  ('Pinecone',           'pinecone.io',       'greenhouse', 'pinecone',           TRUE, 2),
  ('Weaviate',           'weaviate.io',       'greenhouse', 'weaviate',           TRUE, 2),
  ('Runway',             'runwayml.com',      'greenhouse', 'runway',             TRUE, 2),
  ('Together AI',        'together.ai',       'greenhouse', 'togetherai',         TRUE, 2),
  ('Weights & Biases',   'wandb.ai',          'greenhouse', 'weightsandbiases',   TRUE, 2),
  ('DataRobot',          'datarobot.com',     'greenhouse', 'datarobot',          TRUE, 2),
  ('H2O.ai',             'h2o.ai',            'greenhouse', 'h2oai',              TRUE, 2),
  ('CoreWeave',          'coreweave.com',     'greenhouse', 'coreweave',          TRUE, 2),
  ('Lambda Labs',        'lambdalabs.com',    'greenhouse', 'lambdalabs',         TRUE, 2),
  ('Modal',              'modal.com',         'greenhouse', 'modal',              TRUE, 2),
  ('Fireworks AI',       'fireworks.ai',      'greenhouse', 'fireworksai',        TRUE, 2),
  ('Replicate',          'replicate.com',     'greenhouse', 'replicate',          TRUE, 2),
  ('Anyscale',           'anyscale.com',      'greenhouse', 'anyscale',           TRUE, 2),
  ('Stability AI',       'stability.ai',      'greenhouse', 'stabilityai',        TRUE, 2),
  ('Baseten',            'baseten.co',        'greenhouse', 'baseten',            TRUE, 2),
  ('Benchling',          'benchling.com',     'greenhouse', 'benchling',          TRUE, 2),
  ('Roblox',             'roblox.com',        'greenhouse', 'roblox',             TRUE, 2),
  ('Unity',              'unity.com',         'greenhouse', 'unity',              TRUE, 2),
  ('Epic Games',         'epicgames.com',     'greenhouse', 'epicgames',          TRUE, 2),
  ('Niantic',            'nianticlabs.com',   'greenhouse', 'niantic',            TRUE, 2),
  ('Riot Games',         'riotgames.com',     'greenhouse', 'riotgames',          TRUE, 2),
  ('Anduril',            'anduril.com',       'greenhouse', 'anduril',            TRUE, 2),
  ('Shield AI',          'shield.ai',         'greenhouse', 'shieldai',           TRUE, 2),
  ('Applied Intuition',  'appliedintuition.com','greenhouse','appliedintuition',  TRUE, 2),
  ('Waymo',              'waymo.com',         'greenhouse', 'waymo',              TRUE, 2),
  ('Cruise',             'getcruise.com',     'greenhouse', 'cruise',             TRUE, 2),
  ('Aurora',             'aurora.tech',       'greenhouse', 'aurora',             TRUE, 2),
  ('Zoox',               'zoox.com',          'greenhouse', 'zoox',               TRUE, 2),
  ('Planet Labs',        'planet.com',        'greenhouse', 'planetlabs',         TRUE, 2),
  ('Varda',              'varda.com',         'greenhouse', 'varda',              TRUE, 2),
  ('Rocket Lab',         'rocketlabusa.com',  'greenhouse', 'rocketlab',          TRUE, 2)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 2 — Ashby: AI / devtools
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Groq',               'groq.com',          'ashby', 'groq',                    TRUE, 2),
  ('Cerebras',           'cerebras.net',      'ashby', 'cerebras',                TRUE, 2),
  ('SambaNova',          'sambanova.ai',      'ashby', 'sambanova',               TRUE, 2),
  ('Tenstorrent',        'tenstorrent.com',   'ashby', 'tenstorrent',             TRUE, 2),
  ('Character AI',       'character.ai',      'ashby', 'characterai',             TRUE, 2),
  ('LangChain',          'langchain.com',     'ashby', 'langchain',               TRUE, 2),
  ('LlamaIndex',         'llamaindex.ai',     'ashby', 'llamaindex',              TRUE, 2),
  ('Qdrant',             'qdrant.tech',       'ashby', 'qdrant',                  TRUE, 2),
  ('Chroma',             'trychroma.com',     'ashby', 'chroma',                  TRUE, 2),
  ('Adept',              'adept.ai',          'ashby', 'adept',                   TRUE, 2),
  ('Inflection AI',      'inflection.ai',     'ashby', 'inflection',              TRUE, 2),
  ('Pika',               'pika.art',          'ashby', 'pika',                    TRUE, 2),
  ('ElevenLabs',         'elevenlabs.io',     'ashby', 'elevenlabs',              TRUE, 2),
  ('Suno',               'suno.ai',           'ashby', 'suno',                    TRUE, 2),
  ('Midjourney',         'midjourney.com',    'ashby', 'midjourney',              TRUE, 2),
  ('Substrate',          'substrate.run',     'ashby', 'substrate',               TRUE, 2),
  ('OctoAI',             'octo.ai',           'ashby', 'octoai',                  TRUE, 2)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 3 — Greenhouse: Fintech, Modern SaaS, Consumer
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Affirm',             'affirm.com',        'greenhouse', 'affirm',             TRUE, 3),
  ('Block',              'block.xyz',         'greenhouse', 'block',              TRUE, 3),
  ('Square',             'squareup.com',      'greenhouse', 'square',             TRUE, 3),
  ('Cash App',           'cash.app',          'greenhouse', 'cashapp',            TRUE, 3),
  ('Mercury',            'mercury.com',       'greenhouse', 'mercury',            TRUE, 3),
  ('Marqeta',            'marqeta.com',       'greenhouse', 'marqeta',            TRUE, 3),
  ('Checkr',             'checkr.com',        'greenhouse', 'checkr',             TRUE, 3),
  ('Alloy',              'alloy.com',         'greenhouse', 'alloy',              TRUE, 3),
  ('Modern Treasury',    'moderntreasury.com','greenhouse', 'moderntreasury',     TRUE, 3),
  ('Column',             'column.com',        'greenhouse', 'column',             TRUE, 3),
  ('Unit',               'unit.co',           'greenhouse', 'unit',               TRUE, 3),
  ('Gemini',             'gemini.com',        'greenhouse', 'gemini',             TRUE, 3),
  ('Kraken',             'kraken.com',        'greenhouse', 'kraken',             TRUE, 3),
  ('Circle',             'circle.com',        'greenhouse', 'circle',             TRUE, 3),
  ('Fireblocks',         'fireblocks.com',    'greenhouse', 'fireblocks',         TRUE, 3),
  ('BitGo',              'bitgo.com',         'greenhouse', 'bitgo',              TRUE, 3),
  ('Anchorage Digital',  'anchorage.com',     'greenhouse', 'anchorage',          TRUE, 3),
  ('SoFi',               'sofi.com',          'greenhouse', 'sofi',               TRUE, 3),
  ('Wealthfront',        'wealthfront.com',   'greenhouse', 'wealthfront',        TRUE, 3),
  ('Betterment',         'betterment.com',    'greenhouse', 'betterment',         TRUE, 3),
  ('Wise',               'wise.com',          'greenhouse', 'wise',               TRUE, 3),
  ('Deel',               'deel.com',          'greenhouse', 'deel',               TRUE, 3),
  ('Remote',             'remote.com',        'greenhouse', 'remotecom',          TRUE, 3),
  ('Bill',               'bill.com',          'greenhouse', 'billcom',            TRUE, 3),
  ('Navan',              'navan.com',         'greenhouse', 'navan',              TRUE, 3),
  ('Toast',              'pos.toasttab.com',  'greenhouse', 'toast',              TRUE, 3),
  ('Shopify',            'shopify.com',       'greenhouse', 'shopify',            TRUE, 3),
  ('Etsy',               'etsy.com',          'greenhouse', 'etsy',               TRUE, 3),
  ('Wayfair',            'wayfair.com',       'greenhouse', 'wayfair',            TRUE, 3),
  ('Uber',               'uber.com',          'greenhouse', 'uber',               TRUE, 3),
  ('Lyft',               'lyft.com',          'greenhouse', 'lyft',               TRUE, 3),
  ('Peloton',            'onepeloton.com',    'greenhouse', 'peloton',            TRUE, 3),
  ('Strava',             'strava.com',        'greenhouse', 'strava',             TRUE, 3),
  ('Asana',              'asana.com',         'greenhouse', 'asana',              TRUE, 3),
  ('Monday.com',         'monday.com',        'greenhouse', 'mondaycom',          TRUE, 3),
  ('ClickUp',            'clickup.com',       'greenhouse', 'clickup',            TRUE, 3),
  ('Airtable',           'airtable.com',      'greenhouse', 'airtable',           TRUE, 3),
  ('Miro',               'miro.com',          'greenhouse', 'miro',               TRUE, 3),
  ('Smartsheet',         'smartsheet.com',    'greenhouse', 'smartsheet',         TRUE, 3),
  ('Box',                'box.com',           'greenhouse', 'box',                TRUE, 3),
  ('HubSpot',            'hubspot.com',       'greenhouse', 'hubspot',            TRUE, 3),
  ('Zendesk',            'zendesk.com',       'greenhouse', 'zendesk',            TRUE, 3),
  ('Freshworks',         'freshworks.com',    'greenhouse', 'freshworks',         TRUE, 3),
  ('Klaviyo',            'klaviyo.com',       'greenhouse', 'klaviyo',            TRUE, 3),
  ('Braze',              'braze.com',         'greenhouse', 'braze',              TRUE, 3),
  ('Mixpanel',           'mixpanel.com',      'greenhouse', 'mixpanel',           TRUE, 3),
  ('Amplitude',          'amplitude.com',     'greenhouse', 'amplitude',          TRUE, 3),
  ('Heap',               'heap.io',           'greenhouse', 'heap',               TRUE, 3),
  ('Fullstory',          'fullstory.com',     'greenhouse', 'fullstory',          TRUE, 3),
  ('LogRocket',          'logrocket.com',     'greenhouse', 'logrocket',          TRUE, 3),
  ('Intercom',           'intercom.com',      'greenhouse', 'intercom',           TRUE, 3),
  ('Drift',              'drift.com',         'greenhouse', 'drift',              TRUE, 3),
  ('Gong',               'gong.io',           'greenhouse', 'gong',               TRUE, 3),
  ('Outreach',           'outreach.io',       'greenhouse', 'outreach',           TRUE, 3),
  ('Productboard',       'productboard.com',  'greenhouse', 'productboard',       TRUE, 3),
  ('Pendo',              'pendo.io',          'greenhouse', 'pendo',              TRUE, 3),
  ('Canva',              'canva.com',         'greenhouse', 'canva',              TRUE, 3),
  ('Spotify',            'spotify.com',       'greenhouse', 'spotify',            TRUE, 3),
  ('Hims & Hers',        'forhims.com',       'greenhouse', 'himsandhers',        TRUE, 3),
  ('Ro',                 'ro.co',             'greenhouse', 'ro',                 TRUE, 3),
  ('Oura',               'ouraring.com',      'greenhouse', 'oura',               TRUE, 3),
  ('Eight Sleep',        'eightsleep.com',    'greenhouse', 'eightsleep',         TRUE, 3),
  ('Calm',               'calm.com',          'greenhouse', 'calm',               TRUE, 3),
  ('Headspace',          'headspace.com',     'greenhouse', 'headspace',          TRUE, 3),
  ('BetterHelp',         'betterhelp.com',    'greenhouse', 'betterhelp',         TRUE, 3)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 3 — Ashby / Lever: additional fintech + SaaS
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Mercury',            'mercury.com',       'ashby', 'mercury',                 TRUE, 3),
  ('Modern Treasury',    'moderntreasury.com','ashby', 'moderntreasury',          TRUE, 3),
  ('Clerk',              'clerk.com',         'ashby', 'clerk',                   TRUE, 3),
  ('WorkOS',             'workos.com',        'ashby', 'workos',                  TRUE, 3),
  ('Convex',             'convex.dev',        'ashby', 'convex',                  TRUE, 3),
  ('Stytch',             'stytch.com',        'ashby', 'stytch',                  TRUE, 3),
  ('Inngest',            'inngest.com',       'ashby', 'inngest',                 TRUE, 3),
  ('Resend',             'resend.com',        'ashby', 'resend',                  TRUE, 3),
  ('Cal.com',            'cal.com',           'ashby', 'cal',                     TRUE, 3),
  ('Dub',                'dub.co',            'ashby', 'dub',                     TRUE, 3),
  ('Turso',              'turso.tech',        'ashby', 'turso',                   TRUE, 3)
ON CONFLICT (ats, slug) DO NOTHING;

INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Figma',              'figma.com',         'lever', 'figma',                   TRUE, 2),
  ('Squarespace',        'squarespace.com',   'lever', 'squarespace',             TRUE, 3),
  ('Attentive',          'attentive.com',     'lever', 'attentive',               TRUE, 3),
  ('Deliveroo',          'deliveroo.com',     'lever', 'deliveroo',               TRUE, 3),
  ('Zillow',             'zillow.com',        'lever', 'zillow',                  TRUE, 3),
  ('Reddit',             'reddit.com',        'lever', 'reddit',                  TRUE, 3)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 4 — Big Tech custom API scrapers (one synthetic row per employer).
-- These have (ats='google') etc. — the scraper dispatches by ats, not slug.
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Google',             'google.com',        'google',    'default',             TRUE, 4),
  ('Meta',               'meta.com',          'meta',      'default',             TRUE, 4),
  ('Amazon',             'amazon.com',        'amazon',    'default',             TRUE, 4),
  ('Apple',              'apple.com',         'apple',     'default',             TRUE, 4),
  ('Microsoft',          'microsoft.com',     'microsoft', 'default',             TRUE, 4)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 4 — Workday: Big Tech / Enterprise F500
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, workday_site, enabled, tier) VALUES
  ('Adobe',              'adobe.com',         'workday', 'adobe',        'external_experienced',     TRUE, 4),
  ('Intuit',             'intuit.com',        'workday', 'intuit',       'IntuitCareers',            TRUE, 4),
  ('ServiceNow',         'servicenow.com',    'workday', 'servicenow',   'ServiceNow',               TRUE, 4),
  ('Oracle',             'oracle.com',        'workday', 'oracle',       'Corporate',                TRUE, 4),
  ('SAP',                'sap.com',           'workday', 'sap',          'SAPcareers',               TRUE, 4),
  ('AMD',                'amd.com',           'workday', 'amd',          'External',                 TRUE, 4),
  ('Intel',              'intel.com',         'workday', 'intel',        'External',                 TRUE, 4),
  ('Qualcomm',           'qualcomm.com',      'workday', 'qualcomm',     'External',                 TRUE, 4),
  ('Texas Instruments',  'ti.com',            'workday', 'ti',           'External',                 TRUE, 4),
  ('Applied Materials',  'appliedmaterials.com','workday','appliedmaterials','External_Career_Site', TRUE, 4),
  ('HP',                 'hp.com',            'workday', 'hp',           'ExternalCareerSite',       TRUE, 4)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 5 — Greenhouse: Gaming / Media / Enterprise SaaS / E-commerce
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('Zynga',              'zynga.com',         'greenhouse', 'zynga',              TRUE, 5),
  ('Scopely',            'scopely.com',       'greenhouse', 'scopely',            TRUE, 5),
  ('Take-Two',           'take2games.com',    'greenhouse', 'taketwointeractive', TRUE, 5),
  ('Activision Blizzard','activision.com',    'greenhouse', 'activisionblizzard', TRUE, 5),
  ('EA',                 'ea.com',            'greenhouse', 'electronicarts',     TRUE, 5),
  ('Twitch',             'twitch.tv',         'greenhouse', 'twitch',             TRUE, 5),
  ('Mux',                'mux.com',           'greenhouse', 'mux',                TRUE, 5),
  ('LiveKit',            'livekit.io',        'greenhouse', 'livekit',            TRUE, 5),
  ('Brightcove',         'brightcove.com',    'greenhouse', 'brightcove',         TRUE, 5),
  ('Roku',               'roku.com',          'greenhouse', 'roku',               TRUE, 5),
  ('Paramount',          'paramount.com',     'greenhouse', 'paramount',          TRUE, 5),
  ('Warner Bros Discovery','wbd.com',         'greenhouse', 'warnermediacareers', TRUE, 5),
  ('NBCUniversal',       'nbcuni.com',        'greenhouse', 'nbcuniversal',       TRUE, 5),
  ('Vimeo',              'vimeo.com',         'greenhouse', 'vimeo',              TRUE, 5),
  ('Discord',            'discord.com',       'greenhouse', 'discord',            TRUE, 3),
  ('eBay',               'ebay.com',          'greenhouse', 'ebay',               TRUE, 5),
  ('StockX',             'stockx.com',        'greenhouse', 'stockx',             TRUE, 5),
  ('GoDaddy',            'godaddy.com',       'greenhouse', 'godaddy',            TRUE, 5),
  ('Squarespace',        'squarespace.com',   'greenhouse', 'squarespace',        TRUE, 5),
  ('Wix',                'wix.com',           'greenhouse', 'wix',                TRUE, 5),
  ('Twilio SendGrid',    'sendgrid.com',      'greenhouse', 'sendgrid',           TRUE, 5),
  ('Nike',               'nike.com',          'greenhouse', 'nike',               TRUE, 5),
  ('Lululemon',          'lululemon.com',     'greenhouse', 'lululemon',          TRUE, 5),
  ('Tempus',             'tempus.com',        'greenhouse', 'tempus',             TRUE, 5),
  ('Flatiron Health',    'flatiron.com',      'greenhouse', 'flatironhealth',     TRUE, 5),
  ('Oscar Health',       'hioscar.com',       'greenhouse', 'oscar',              TRUE, 5),
  ('Ro',                 'ro.co',             'greenhouse', 'roco',               TRUE, 5),
  ('Included Health',    'includedhealth.com','greenhouse', 'includedhealth',     TRUE, 5),
  ('Teladoc',            'teladochealth.com', 'greenhouse', 'teladoc',            TRUE, 5),
  ('Maven Clinic',       'mavenclinic.com',   'greenhouse', 'mavenclinic',        TRUE, 5)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 5 — Workday: enterprise / telecom
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, workday_site, enabled, tier) VALUES
  ('T-Mobile',           't-mobile.com',      'workday', 'tmobile',      'Careers',                  TRUE, 5),
  ('Verizon',            'verizon.com',       'workday', 'verizon',      'vzcareers',                TRUE, 5),
  ('AT&T',               'att.com',           'workday', 'att',          'External',                 TRUE, 5),
  ('Comcast',            'comcast.com',       'workday', 'comcast',      'Comcast_Careers',          TRUE, 5),
  ('Charter',            'spectrum.com',      'workday', 'charter',      'External',                 TRUE, 5),
  ('Warner Bros. Discovery','wbd.com',        'workday', 'warnerbros',   'warnerbros',               TRUE, 5)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 6 — Workday: Fortune 500 non-tech (highest volume, lowest signal)
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, workday_site, enabled, tier) VALUES
  ('JPMorgan Chase',     'jpmorganchase.com', 'workday', 'jpmc',         'jpmc',                     TRUE, 6),
  ('Goldman Sachs',      'goldmansachs.com',  'workday', 'goldmansachs', 'GS',                       TRUE, 6),
  ('Morgan Stanley',     'morganstanley.com', 'workday', 'morganstanley','ms',                       TRUE, 6),
  ('Bank of America',    'bankofamerica.com', 'workday', 'bankofamerica','bofa',                     TRUE, 6),
  ('Wells Fargo',        'wellsfargo.com',    'workday', 'wellsfargo',   'External_Career_Site',     TRUE, 6),
  ('Citi',               'citigroup.com',     'workday', 'citi',         'Citi',                     TRUE, 6),
  ('Capital One',        'capitalone.com',    'workday', 'capitalone',   'Capital_One',              TRUE, 6),
  ('American Express',   'americanexpress.com','workday','amex',         'AXP',                      TRUE, 6),
  ('Discover',           'discover.com',      'workday', 'discover',     'External_Career',          TRUE, 6),
  ('Charles Schwab',     'schwab.com',        'workday', 'schwab',       'External',                 TRUE, 6),
  ('Fidelity',           'fidelity.com',      'workday', 'fidelity',     'Fidelity_Careers',         TRUE, 6),
  ('BlackRock',          'blackrock.com',     'workday', 'blackrock',    'BlackRock_Professional',   TRUE, 6),
  ('Vanguard',           'vanguard.com',      'workday', 'vanguard',     'Vanguard',                 TRUE, 6),
  ('State Street',       'statestreet.com',   'workday', 'statestreet',  'External',                 TRUE, 6),
  ('Progressive',        'progressive.com',   'workday', 'progressive',  'progressive',              TRUE, 6),
  ('Allstate',           'allstate.com',      'workday', 'allstate',     'External',                 TRUE, 6),
  ('Travelers',          'travelers.com',     'workday', 'travelers',    'External_Career_Site',     TRUE, 6),
  ('Chubb',              'chubb.com',         'workday', 'chubb',        'chubb',                    TRUE, 6),
  ('MetLife',            'metlife.com',       'workday', 'metlife',      'External',                 TRUE, 6),
  ('Prudential',         'prudential.com',    'workday', 'prudential',   'Professional_Careers',     TRUE, 6),
  ('UnitedHealth Group', 'unitedhealthgroup.com','workday','unitedhealthgroup','External',           TRUE, 6),
  ('Humana',             'humana.com',        'workday', 'humana',       'Humana_External_Career_Site', TRUE, 6),
  ('Cigna',              'cigna.com',         'workday', 'cigna',        'cigna_Careers',            TRUE, 6),
  ('Walmart',            'walmart.com',       'workday', 'walmart',      'WalmartExternal',          TRUE, 6),
  ('Target',             'target.com',        'workday', 'target',       'targetcareers',            TRUE, 6),
  ('Costco',             'costco.com',        'workday', 'costco',       'External',                 TRUE, 6),
  ('Best Buy',           'bestbuy.com',       'workday', 'bestbuy',      'External',                 TRUE, 6),
  ('Procter & Gamble',   'pg.com',            'workday', 'pg',           'External_Career_Site',     TRUE, 6),
  ('PepsiCo',            'pepsico.com',       'workday', 'pepsico',      'PepsiCoJobs',              TRUE, 6),
  ('Coca-Cola',          'coca-colacompany.com','workday','cocacola',    'coke',                     TRUE, 6),
  ('General Mills',      'generalmills.com',  'workday', 'generalmills', 'General_Mills',            TRUE, 6),
  ('FedEx',              'fedex.com',         'workday', 'fedex',        'FXcareers',                TRUE, 6),
  ('UPS',                'ups.com',           'workday', 'ups',          'UPScareers',               TRUE, 6),
  ('Boeing',             'boeing.com',        'workday', 'boeing',       'External',                 TRUE, 6),
  ('Lockheed Martin',    'lockheedmartin.com','workday', 'lockheedmartin','LM_Careers',              TRUE, 6),
  ('Northrop Grumman',   'northropgrumman.com','workday','northropgrumman','NGC_External',           TRUE, 6),
  ('Raytheon',           'rtx.com',           'workday', 'raytheon',     'RTX',                      TRUE, 6),
  ('L3Harris',           'l3harris.com',      'workday', 'l3harris',     'L3Harris',                 TRUE, 6),
  ('Leidos',             'leidos.com',        'workday', 'leidos',       'External',                 TRUE, 6),
  ('Booz Allen Hamilton','boozallen.com',     'workday', 'boozallen',    'External',                 TRUE, 6),
  ('SAIC',               'saic.com',          'workday', 'saic',         'External',                 TRUE, 6),
  ('CACI',               'caci.com',          'workday', 'caci',         'External_Career_Site',     TRUE, 6),
  ('Accenture',          'accenture.com',     'workday', 'accenture',    'AccentureCareers',         TRUE, 6),
  ('Deloitte',           'deloitte.com',      'workday', 'deloitte',     'Deloitte_External',        TRUE, 6),
  ('Ford',               'ford.com',          'workday', 'ford',         'fordcareers',              TRUE, 6),
  ('GM',                 'gm.com',            'workday', 'gm',           'GMCareers',                TRUE, 6),
  ('Deere',              'deere.com',         'workday', 'deere',        'jobs',                     TRUE, 6),
  ('Caterpillar',        'caterpillar.com',   'workday', 'caterpillar',  'CaterpillarCareers',       TRUE, 6),
  ('3M',                 '3m.com',            'workday', '3m',           'Search',                   TRUE, 6),
  ('GE',                 'ge.com',            'workday', 'ge',           'GECareers',                TRUE, 6),
  ('Honeywell',          'honeywell.com',     'workday', 'honeywell',    'Honeywell',                TRUE, 6),
  ('Siemens',            'siemens.com',       'workday', 'siemens',      'siemens',                  TRUE, 6)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tier 7 — Aggregators. One synthetic row per source. The scraper dispatches
-- on `ats`; `slug` is 'default' by convention. Actual employer name is
-- stored on raw_jobs.source_company_name.
-- ---------------------------------------------------------------------------
INSERT INTO companies (name, domain, ats, slug, enabled, tier) VALUES
  ('RemoteOK (aggregated)',        'remoteok.com',            'remoteok',     'default', TRUE, 7),
  ('Remotive (aggregated)',        'remotive.com',            'remotive',     'default', TRUE, 7),
  ('YC Work at a Startup (agg.)',  'workatastartup.com',      'yc_wafs',      'default', TRUE, 7),
  ('HN Who is Hiring (agg.)',      'news.ycombinator.com',    'hn_hiring',    'default', TRUE, 7),
  ('SimplifyJobs (agg.)',          'github.com/simplifyjobs', 'simplifyjobs', 'default', TRUE, 7)
ON CONFLICT (ats, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Clean up stale Phase-2 rows that the 005 migration disabled but left at
-- tier 3. They don't return results — keep them disabled and tier them low
-- so any future manual re-enable still keeps them below good targets.
-- ---------------------------------------------------------------------------
UPDATE companies SET tier = 6
 WHERE enabled = FALSE;

-- ---------------------------------------------------------------------------
-- Normalize: ensure every enabled row has a non-null tier (defaults handle
-- inserts, but ALTER ADD COLUMN only defaults existing rows if DEFAULT is
-- specified — we did, so this is belt-and-suspenders).
-- ---------------------------------------------------------------------------
UPDATE companies SET tier = 3 WHERE tier IS NULL;

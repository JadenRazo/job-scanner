-- Phase 3 seed: placeholder profile so the Stage 2 pipeline has something to
-- score against on day one. Jaden replaces the resume via:
--
--   cat real-resume.md | docker exec -i scanner-worker node dist/cli/set-resume.js
--
-- Everything else (filters, threshold) is editable with a one-line UPDATE.

UPDATE profile SET
  full_name       = 'Jaden Razo',
  contact_email   = 'jaden@raizhost.com',
  resume_md       = $RESUME$
# Jaden Razo — Full-Stack Software Engineer

California, USA · jaden@raizhost.com · github.com/JadenRazo

## Summary
Self-taught full-stack engineer who has shipped and operates a production multi-tenant hosting platform (raizhost.com) end to end: marketing site, customer dashboard, admin API, infrastructure, and deployments. Comfortable across the whole stack — from writing Next.js route handlers to bringing up Kubernetes on a bare VPS. Strong in TypeScript, Node, Postgres, and Linux/Docker-based infra. Most recent work is automation, developer tooling, and platform engineering.

## Core skills
- **Languages:** TypeScript, JavaScript, Python, Go (familiar), Bash
- **Frontend:** Next.js 15 (App Router, React 19), Tailwind CSS, shadcn/ui, Puck visual editor
- **Backend:** Node.js, REST APIs, WebSockets, BullMQ, Drizzle ORM, Better Auth
- **Data:** PostgreSQL (SQL, indexing, migrations), Redis
- **Infra / DevOps:** Docker, docker-compose, Kubernetes, ArgoCD, Caddy, GitHub Actions, SSH-based deploys, Linux VPS administration, Azure (hub-and-spoke networking), Cloudflare
- **LLM / Agentic:** Claude API, Claude Code, MCP servers, prompt engineering, retrieval pipelines

## Selected projects
- **raizhost.com** — Multi-tenant website builder + hosting platform. Clients sign up, build pages with a visual editor, and publish to static HTML served by Caddy. Built with Next.js 15, PostgreSQL (Drizzle), Better Auth, Docker Compose. Runs on my own VPS with CI/CD via GitHub Actions.
- **CloudCostMCP** — MCP server that exposes cloud cost data to Claude agents for analysis.
- **TicketHacker** — Automation tool for ticket acquisition workflows, Redis-backed job queue, Playwright-driven browser sessions.
- **dev-environment-orchestrator** — Tool that spins up isolated dev environments via containers and per-project config.
- **azure-hub-spoke-network** — IaC for an Azure hub-and-spoke topology with firewall + VPN routing.

## What I'm looking for
Software engineering roles — full-stack, backend, platform, or DevEx — at companies that ship real products and move fast. Remote or California. Comfortable joining early teams and taking on infra-adjacent work.

[PLACEHOLDER — replace with real resume via `docker exec -i scanner-worker node dist/cli/set-resume.js < resume.md`]
$RESUME$,
  title_allow     = ARRAY['Engineer','Developer','Software','SWE','Full Stack','Fullstack','Backend','Frontend','Platform','Infrastructure','DevOps']::text[],
  title_deny      = ARRAY['Director','VP','Vice President','Chief','Head of','SVP','EVP','Engineering Manager','Senior Manager','Principal Manager']::text[],
  seniority_allow = ARRAY[]::text[],
  locations_allow = ARRAY[]::text[],
  remote_only     = FALSE,
  score_threshold = 70,
  paused          = FALSE
WHERE id = 1;

# job-scanner

24/7 ATS-aware job scanner, matcher, and cover-letter drafter for Jaden Razo.

Runs inside the raizhost k3s cluster as a self-contained stack (Postgres + Redis
+ Next.js dashboard + BullMQ worker), managed by ArgoCD via the
[`raizhost-infra`](https://github.com/JadenRazo/raizhost-infra) repo under
`base/apps/job-scanner/`.

## Layout

```
api/        Next.js 15 App Router dashboard (Better Auth, Drizzle, multi-resume upload)
worker/     Node 22 worker (BullMQ, Playwright, Claude Code CLI, LibreOffice)
db/         SQL migrations — source of truth for the init-sql ConfigMap
```

## How it runs in production

1. Push to `main` → GH Actions builds both images → pushes to GHCR as
   `ghcr.io/jadenrazo/job-scanner-{api,worker}:v1` (and `:sha-<short>`, `:latest`).
2. `raizhost-infra` references the `:v1` tag; k3s pulls on first use.
3. ArgoCD auto-syncs any change in `raizhost-infra/base/apps/job-scanner/`.

See `/root/.claude/plans/groovy-swimming-abelson.md` for the full design.

## Local development

A `docker-compose.yml` exists for local iteration against the same Postgres
and Redis pair, decoupled from k3s. It is **not** the production deployment
vehicle — the cluster manifests in `raizhost-infra` are authoritative.

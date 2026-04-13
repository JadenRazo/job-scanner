# syntax=docker/dockerfile:1.6

# ---------- builder ----------
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json ./
# Phase 1: no lockfile committed yet. Switch to `npm ci` once package-lock.json
# is checked in.
COPY package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets

RUN npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-core \
      libreoffice-writer \
      fonts-urw-base35 \
      fonts-crosextra-carlito \
      fonts-liberation \
      python3 \
      python3-pil \
      fontconfig \
      ca-certificates \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

# Phase 2: install playwright browsers here with `npx playwright install chromium`.

WORKDIR /app

COPY assets/build-signature.py /app/assets/build-signature.py
RUN python3 /app/assets/build-signature.py && test -s /app/assets/signature.png
RUN soffice --headless --version

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Install Claude Code CLI globally — the worker shells out to `claude -p` for
# all LLM calls, authenticated against the host's Max subscription via a
# bind-mounted credentials file (see docker-compose.yml).
RUN npm install -g @anthropic-ai/claude-code \
 && claude --version

# Create the directory where docker-compose will bind-mount the credentials
# file. Must exist before the mount, with correct perms for the CLI to read.
RUN mkdir -p /app/.claude && chmod 700 /app/.claude

ENV HOME=/app

CMD ["node", "dist/index.js"]

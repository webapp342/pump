#!/bin/bash
# Fast deploy: Next.js UI + admin static only (monorepo apps/web + apps/admin).
# Skips realtime rebuild and indexer deploy. Full stack: deploy/tma-deploy.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"
WEB_DIR="$REPO_ROOT/apps/web"
PM2_APP="${PM2_APP:-pump-tma}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
GIT_REF="${GIT_REF:-main}"

log() {
  echo "[ui-deploy] $*"
}

cd "$REPO_ROOT"

log "Syncing repo to origin/${GIT_REF}"
git fetch origin "$GIT_REF"
git reset --hard "origin/${GIT_REF}"
git clean -fd

log "Installing workspace dependencies"
npm ci

if [[ -f "$REPO_ROOT/.env" ]]; then
  log "Linking root .env for Next.js build (NEXT_PUBLIC_* inlined at build time)"
  ln -sfn "$REPO_ROOT/.env" "$WEB_DIR/.env"
fi

log "Building Next.js (@pump/web)"
npm run build -w @pump/web

if [[ -f "$REPO_ROOT/deploy/admin-console-build.sh" ]]; then
  log "Building admin console"
  chmod +x "$REPO_ROOT/deploy/admin-console-build.sh"
  bash "$REPO_ROOT/deploy/admin-console-build.sh"
else
  log "WARN: deploy/admin-console-build.sh missing — skip admin build"
fi

STANDALONE_APP_DIR="$WEB_DIR/.next/standalone/apps/web"
if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
  STANDALONE_APP_DIR="$WEB_DIR/.next/standalone"
fi
if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
  log "standalone server.js missing under apps/web/.next/standalone"
  exit 1
fi

log "Copying static assets into standalone output ($STANDALONE_APP_DIR)"
chmod +x "$REPO_ROOT/deploy/copy-next-standalone-static.sh"
bash "$REPO_ROOT/deploy/copy-next-standalone-static.sh" "$WEB_DIR" "$STANDALONE_APP_DIR"
if [ -d "$WEB_DIR/public" ]; then
  cp -a "$WEB_DIR/public" "$STANDALONE_APP_DIR/public"
fi

log "Reloading PM2 pump-tma from ecosystem.config.cjs"
pm2 startOrRestart "$REPO_ROOT/ecosystem.config.cjs" --only "$PM2_APP" --update-env

log "Health check: $HEALTH_URL"
health_ok=0
for attempt in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    health_ok=1
    break
  fi
  log "Waiting for app to become ready (${attempt}/30)..."
  sleep 2
done

if [ "$health_ok" -ne 1 ]; then
  log "Health check failed after 60s: $PM2_APP"
  pm2 logs "$PM2_APP" --lines 30 --nostream || true
  exit 1
fi

SAMPLE_CHUNK="$(find "$STANDALONE_APP_DIR/.next/static/chunks" -type f -name '*.js' 2>/dev/null | head -1 || true)"
if [[ -n "$SAMPLE_CHUNK" ]]; then
  SAMPLE_URL="/_next/static/chunks/$(basename "$SAMPLE_CHUNK")"
  if curl -sf "http://127.0.0.1:3012${SAMPLE_URL}" >/dev/null; then
    log "Static chunk OK via app: $SAMPLE_URL"
  else
    log "WARN: app did not serve $SAMPLE_URL — reload nginx with deploy/nginx-next-static.conf.snippet"
  fi
fi

log "UI deploy finished successfully"
log "App: http://<host>/  · Admin: http://<host>/admin/"

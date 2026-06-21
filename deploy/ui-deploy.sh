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

log "Building Next.js (@pump/web)"
npm run build -w @pump/web

if [[ -f "$REPO_ROOT/deploy/admin-console-build.sh" ]]; then
  log "Building admin console"
  chmod +x "$REPO_ROOT/deploy/admin-console-build.sh"
  bash "$REPO_ROOT/deploy/admin-console-build.sh"
else
  log "WARN: deploy/admin-console-build.sh missing — skip admin build"
fi

log "Copying static assets into standalone output"
mkdir -p "$WEB_DIR/.next/standalone/.next"
cp -r "$WEB_DIR/.next/static" "$WEB_DIR/.next/standalone/.next/static"
if [ -d "$WEB_DIR/public" ]; then
  cp -r "$WEB_DIR/public" "$WEB_DIR/.next/standalone/public"
fi

log "Restarting PM2 app: $PM2_APP (realtime + indexer unchanged)"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  log "$PM2_APP not registered in PM2; starting from ecosystem.config.cjs"
  pm2 start "$REPO_ROOT/ecosystem.config.cjs" --only "$PM2_APP"
fi

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

log "UI deploy finished successfully"
log "App: http://<host>/  · Admin: http://<host>/admin/"

#!/bin/bash
# Fast deploy: Next.js UI + admin static only (monorepo apps/web + apps/admin).
# Skips realtime rebuild, migrations, and indexer. Full stack: deploy/tma-deploy.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"
WEB_DIR="$REPO_ROOT/apps/web"
PM2_APP="${PM2_APP:-pump-tma}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"

log() {
  echo "[ui-deploy] $*"
}

cd "$REPO_ROOT"
chmod +x deploy/vm/deploy-common.sh 2>/dev/null || true
# shellcheck source=deploy/vm/deploy-common.sh
source deploy/vm/deploy-common.sh
deploy_prepare ui
log() { echo "[ui-deploy] $*"; }

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
mkdir -p "$STANDALONE_APP_DIR/.next"
cp -r "$WEB_DIR/.next/static" "$STANDALONE_APP_DIR/.next/static"
if [ -d "$WEB_DIR/public" ]; then
  cp -r "$WEB_DIR/public" "$STANDALONE_APP_DIR/public"
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

log "UI deploy finished successfully (sha=${DEPLOY_SHA:-unknown})"
log "App: http://<host>/  · Admin: http://<host>/admin/"

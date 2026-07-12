#!/bin/bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"
WEB_DIR="$REPO_ROOT/apps/web"
ADMIN_DIR="$REPO_ROOT/apps/admin"
REALTIME_DIR="$REPO_ROOT/apps/realtime"
PM2_APP="${PM2_APP:-pump-tma}"
REALTIME_PM2_APP="${REALTIME_PM2_APP:-pump-realtime}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
REALTIME_HEALTH_URL="${REALTIME_HEALTH_URL:-http://127.0.0.1:3013}"

log() {
  echo "[tma-deploy] $*"
}

cd "$REPO_ROOT"

GIT_REF="${GIT_REF:-main}"

chmod +x deploy/vm/system-health.sh 2>/dev/null || true

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
mkdir -p "$STANDALONE_APP_DIR/.next"
cp -r "$WEB_DIR/.next/static" "$STANDALONE_APP_DIR/.next/static"
if [ -d "$WEB_DIR/public" ]; then
  cp -r "$WEB_DIR/public" "$STANDALONE_APP_DIR/public"
fi

log "Building pump-realtime"
npm run build -w @pump/realtime
if [ ! -f "$REALTIME_DIR/dist/server.js" ]; then
  log "pump-realtime build did not produce dist/server.js"
  exit 1
fi

log "Reloading PM2 from ecosystem.config.cjs (applies cwd/script paths)"
pm2 startOrRestart "$REPO_ROOT/ecosystem.config.cjs" --update-env

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

log "Health check: $REALTIME_HEALTH_URL"
realtime_ok=0
for attempt in $(seq 1 30); do
  if curl -sf "$REALTIME_HEALTH_URL" >/dev/null; then
    realtime_ok=1
    break
  fi
  log "Waiting for pump-realtime to become ready (${attempt}/30)..."
  sleep 2
done

if [ "$realtime_ok" -ne 1 ]; then
  log "Health check failed after 60s: $REALTIME_PM2_APP"
  pm2 logs "$REALTIME_PM2_APP" --lines 30 --nostream || true
  exit 1
fi

if [[ "${SKIP_INDEXER_DEPLOY:-}" != "1" ]] && [[ -f "$REPO_ROOT/deploy/vm/indexer-deploy.sh" ]]; then
  log "Deploying indexer (sync + rebuild + restart)"
  chmod +x "$REPO_ROOT/deploy/vm/indexer-deploy.sh"
  bash "$REPO_ROOT/deploy/vm/indexer-deploy.sh" || {
    log "Indexer deploy failed — fix artifacts/.env/RPC and re-run: deploy/vm/indexer-deploy.sh"
  }
else
  log "Skipping indexer deploy (SKIP_INDEXER_DEPLOY=1 or script missing)"
fi

log "Deploy finished successfully"
log "Admin UI: http://<host>/admin/  (nginx location /admin/ — run nginx -t && reload if config changed)"

#!/bin/bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"
WEB_DIR="$REPO_ROOT/apps/web"
REALTIME_DIR="$REPO_ROOT/apps/realtime"
PM2_APP="${PM2_APP:-pump-tma}"
REALTIME_PM2_APP="${REALTIME_PM2_APP:-pump-realtime}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
REALTIME_HEALTH_URL="${REALTIME_HEALTH_URL:-http://127.0.0.1:3013}"
GIT_REF="${GIT_REF:-main}"

log() {
  echo "[tma-deploy] $*"
}

cd "$REPO_ROOT"
chmod +x deploy/vm/system-health.sh deploy/vm/deploy-common.sh 2>/dev/null || true
# shellcheck source=deploy/vm/deploy-common.sh
source deploy/vm/deploy-common.sh
deploy_prepare full
log() { echo "[tma-deploy] $*"; }

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

log "Building ch-flusher (@pump/ch-flusher)"
npm run build -w @pump/ch-flusher
if [ ! -f "$REPO_ROOT/apps/ch-flusher/dist/flusher.js" ]; then
  log "ch-flusher build did not produce dist/flusher.js"
  exit 1
fi

log "Reloading PM2 from ecosystem.config.cjs (applies cwd/script paths)"
chmod +x "$REPO_ROOT/deploy/vm/start-ch-flusher.sh" "$REPO_ROOT/deploy/vm/start-price-worker.sh" 2>/dev/null || true
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

if [[ "${SKIP_INDEXER_DEPLOY:-}" != "1" ]] && [[ -f "$REPO_ROOT/deploy/vm/indexer-sol-go-deploy.sh" ]]; then
  log "Deploying Solana Go indexer (F5)"
  chmod +x "$REPO_ROOT/deploy/vm/indexer-sol-go-deploy.sh"
  if bash "$REPO_ROOT/deploy/vm/indexer-sol-go-deploy.sh"; then
    log "Go indexer deploy OK"
  elif [[ "${INDEXER_DEPLOY_REQUIRED:-}" == "1" ]]; then
    log "ERROR: indexer-sol-go required but failed"
    exit 1
  else
    log "WARN: indexer-sol-go failed — web/realtime deployed; fix Go/.env and re-run deploy/vm/indexer-sol-go-deploy.sh"
  fi
elif [[ "${USE_TS_INDEXER:-}" == "1" ]] && [[ "${SKIP_INDEXER_DEPLOY:-}" != "1" ]] && [[ -f "$REPO_ROOT/deploy/vm/indexer-sol-deploy.sh" ]]; then
  log "Deploying legacy TS indexer-sol (USE_TS_INDEXER=1 rollback)"
  chmod +x "$REPO_ROOT/deploy/vm/indexer-sol-deploy.sh"
  bash "$REPO_ROOT/deploy/vm/indexer-sol-deploy.sh" || {
    log "WARN: indexer-sol deploy failed"
  }
elif [[ "${SKIP_EVM_INDEXER:-}" != "1" ]] && [[ "${SKIP_INDEXER_DEPLOY:-}" != "1" ]] && [[ -f "$REPO_ROOT/deploy/vm/indexer-deploy.sh" ]]; then
  log "Deploying EVM indexer"
  chmod +x "$REPO_ROOT/deploy/vm/indexer-deploy.sh"
  bash "$REPO_ROOT/deploy/vm/indexer-deploy.sh" || {
    log "Indexer deploy failed — fix artifacts/.env/RPC and re-run: deploy/vm/indexer-deploy.sh"
  }
else
  log "Skipping indexer deploy"
fi

log "Deploy finished successfully (sha=${DEPLOY_SHA:-unknown})"
bash deploy/vm/deploy-post-smoke.sh "$REPO_ROOT" || true
log "Admin UI: http://<host>/admin/"

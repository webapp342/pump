#!/usr/bin/env bash
# Targeted VM deploy — only runs slices listed in DEPLOY_TARGETS (see gh-classify-targets.sh).
# Usage:
#   DEPLOY_TARGETS=sync,indexer_go bash deploy/vm/deploy-targeted.sh
#   DEPLOY_MODE=full bash deploy/vm/deploy-targeted.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"
WEB_DIR="$REPO_ROOT/apps/web"
REALTIME_DIR="$REPO_ROOT/apps/realtime"
PM2_APP="${PM2_APP:-pump-tma}"
REALTIME_PM2_APP="${REALTIME_PM2_APP:-pump-realtime}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
REALTIME_HEALTH_URL="${REALTIME_HEALTH_URL:-http://127.0.0.1:3013}"
GIT_REF="${GIT_REF:-main}"

TARGETS_RAW="${DEPLOY_TARGETS:-sync}"
PROFILE="${DEPLOY_PROFILE:-targeted}"

log() { echo "[deploy:$PROFILE] $*"; }

has_target() {
  local t="$1"
  [[ ",${TARGETS_RAW}," == *",${t},"* ]]
}

pm2_reload_selected() {
  if has_target pm2; then
    log "slice: pm2 reload ALL (ecosystem.config.cjs changed)"
    pm2 startOrRestart "$REPO_ROOT/ecosystem.config.cjs" --update-env
    return
  fi

  local apps=()
  has_target web && apps+=("$PM2_APP")
  has_target realtime && apps+=("$REALTIME_PM2_APP")
  has_target ch_flusher && apps+=("pump-ch-flusher")
  has_target price_worker && apps+=("pump-price-worker")

  if [[ ${#apps[@]} -eq 0 ]]; then
    log "slice: pm2 skip (no app slices touched)"
    return
  fi

  local only
  only="$(IFS=,; echo "${apps[*]}")"
  log "slice: pm2 reload only $only"
  pm2 startOrRestart "$REPO_ROOT/ecosystem.config.cjs" --only "$only" --update-env
}

cd "$REPO_ROOT"
chmod +x deploy/vm/*.sh 2>/dev/null || true
# shellcheck source=deploy/vm/deploy-common.sh
source deploy/vm/deploy-common.sh

log "START sha=${DEPLOY_SHA:-pending} ref=$GIT_REF targets=$TARGETS_RAW"

deploy_sync_repo
deploy_ensure_env
log() { echo "[deploy:$PROFILE] $*"; }

PREFLIGHT_MODE=full
if has_target migrate && ! has_target web && ! has_target indexer_go; then
  PREFLIGHT_MODE=migrate
elif has_target indexer_go && ! has_target web; then
  PREFLIGHT_MODE=indexer
elif [[ "$PROFILE" == "sync_only" ]] || [[ "$TARGETS_RAW" == "sync" ]]; then
  PREFLIGHT_MODE=migrate
fi
bash deploy/vm/deploy-preflight.sh "$REPO_ROOT" "$PREFLIGHT_MODE"

if has_target deps; then
  log "slice: deps"
  bash deploy/vm/ensure-node-deps.sh "$REPO_ROOT"
fi

if has_target migrate; then
  log "slice: migrate (schema_migrations ledger)"
  bash deploy/vm/run-pending-migrations.sh "$REPO_ROOT"
fi

if has_target packages; then
  log "slice: packages (@pump/solana-sdk + @pump/xp)"
  npm run build -w @pump/solana-sdk --if-present
  npm run build -w @pump/xp --if-present
fi

if has_target web; then
  log "slice: web (Next.js @pump/web)"
  if [[ -f "$REPO_ROOT/.env" ]]; then
    ln -sfn "$REPO_ROOT/.env" "$WEB_DIR/.env"
  fi
  export NEXT_PRIVATE_BUILD_WORKERS="${NEXT_PRIVATE_BUILD_WORKERS:-2}"
  npm run build -w @pump/web

  STANDALONE_APP_DIR="$WEB_DIR/.next/standalone/apps/web"
  if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
    STANDALONE_APP_DIR="$WEB_DIR/.next/standalone"
  fi
  if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
    log "ERROR: standalone server.js missing"
    exit 1
  fi
  mkdir -p "$STANDALONE_APP_DIR/.next"
  cp -r "$WEB_DIR/.next/static" "$STANDALONE_APP_DIR/.next/static"
  [[ -d "$WEB_DIR/public" ]] && cp -r "$WEB_DIR/public" "$STANDALONE_APP_DIR/public"
fi

if has_target admin; then
  if [[ -f "$REPO_ROOT/deploy/admin-console-build.sh" ]]; then
    log "slice: admin (nginx static /admin/ — no pm2)"
    bash "$REPO_ROOT/deploy/admin-console-build.sh"
  fi
fi

if has_target realtime; then
  log "slice: realtime (Redis WS pubsub)"
  npm run build -w @pump/realtime
  [[ -f "$REALTIME_DIR/dist/server.js" ]] || { log "ERROR: realtime dist missing"; exit 1; }
fi

if has_target ch_flusher; then
  log "slice: ch-flusher (Redis→ClickHouse stream)"
  npm run build -w @pump/ch-flusher
  [[ -f "$REPO_ROOT/apps/ch-flusher/dist/flusher.js" ]] || { log "ERROR: ch-flusher dist missing"; exit 1; }
fi

if has_target price_worker; then
  log "slice: price_worker (scripts/price-worker.ts — pm2 reload only)"
fi

pm2_reload_selected

if has_target indexer_go; then
  log "slice: indexer-go (LaserStream → PG/Redis/CH)"
  # shellcheck source=deploy/vm/ensure-go-path.sh
  source "$REPO_ROOT/deploy/vm/ensure-go-path.sh"
  ensure_go_path || true
  if bash "$REPO_ROOT/deploy/vm/indexer-sol-go-deploy.sh"; then
    log "indexer-go OK"
  elif [[ "${INDEXER_DEPLOY_REQUIRED:-}" == "1" ]]; then
    exit 1
  else
    log "WARN: indexer-go skipped/failed — ensure Go 1.25+ on PATH (/usr/local/go/bin)"
  fi
fi

if has_target web; then
  log "health: web $HEALTH_URL"
  ok=0
  for i in $(seq 1 30); do
    curl -sf "$HEALTH_URL" >/dev/null && { ok=1; break; }
    sleep 2
  done
  [[ "$ok" -eq 1 ]] || { log "ERROR: web health failed"; pm2 logs "$PM2_APP" --lines 20 --nostream || true; exit 1; }
fi

if has_target realtime; then
  log "health: realtime $REALTIME_HEALTH_URL"
  ok=0
  for i in $(seq 1 30); do
    curl -sf "$REALTIME_HEALTH_URL" >/dev/null && { ok=1; break; }
    sleep 2
  done
  [[ "$ok" -eq 1 ]] || { log "ERROR: realtime health failed"; exit 1; }
fi

export DEPLOY_SHA="${DEPLOY_SHA:-$(git rev-parse --short HEAD)}"
export DEPLOY_TARGETS="$TARGETS_RAW"
bash deploy/vm/deploy-post-smoke.sh "$REPO_ROOT" || true

log "DONE profile=$PROFILE targets=$TARGETS_RAW sha=$DEPLOY_SHA"

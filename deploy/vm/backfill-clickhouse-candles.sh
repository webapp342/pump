#!/usr/bin/env bash
# Backfill pump.candles_spot from PostgreSQL token_candles (VM / prod).
# Prefers pre-built dist from tma-deploy; falls back to pg+curl script (no tsc).
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
INDEXER_APP="${TMA_DIR}/apps/indexer-sol"
ENV_FILE="${INDEXER_APP}/.env"
BACKFILL_JS="${INDEXER_APP}/dist/backfill-clickhouse-candles.js"
PG_SCRIPT="${TMA_DIR}/deploy/vm/backfill-clickhouse-candles-pg.sh"

log() { echo "[backfill-clickhouse-candles] $*"; }

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: missing $ENV_FILE"
  exit 1
fi

if [[ -f "$BACKFILL_JS" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  if [[ -z "${CLICKHOUSE_URL:-}" ]]; then
    log "ERROR: CLICKHOUSE_URL not set in $ENV_FILE"
    exit 1
  fi
  log "Using pre-built $BACKFILL_JS"
  node "$BACKFILL_JS"
else
  log "dist/backfill-clickhouse-candles.js not found — using psql+curl backfill (no tsc)"
  if [[ ! -f "$PG_SCRIPT" ]]; then
    log "ERROR: missing $PG_SCRIPT"
    log "Run full deploy first: bash deploy/tma-deploy.sh"
    log "Or: cd $TMA_DIR && npm ci && npm run build -w @pump/indexer-sol"
    exit 1
  fi
  bash "$PG_SCRIPT"
fi

log "Verify:"
docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.candles_spot" 2>/dev/null || true
log "DONE"

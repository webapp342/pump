#!/usr/bin/env bash
# Backfill pump.candles_spot from PostgreSQL token_candles (VM / prod — no tsx).
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
INDEXER_APP="${TMA_DIR}/apps/indexer-sol"
ENV_FILE="${INDEXER_APP}/.env"

log() { echo "[backfill-clickhouse-candles] $*"; }

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: missing $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${CLICKHOUSE_URL:-}" ]]; then
  log "ERROR: CLICKHOUSE_URL not set in $ENV_FILE"
  exit 1
fi

log "Building indexer-sol…"
cd "$TMA_DIR"
npm run build -w @pump/solana-sdk
npm run build -w @pump/indexer-sol

if [[ ! -f "$INDEXER_APP/dist/backfill-clickhouse-candles.js" ]]; then
  log "ERROR: dist/backfill-clickhouse-candles.js missing after build"
  exit 1
fi

log "Running backfill (PG token_candles → CH candles_spot)…"
node "$INDEXER_APP/dist/backfill-clickhouse-candles.js"

log "Verify row count (optional):"
docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.candles_spot" || true

log "DONE"

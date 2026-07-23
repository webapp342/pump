#!/usr/bin/env bash
# F0 — ClickHouse recover: wait for HTTP ping → backfill candles + trades → parity check.
# Safe order (never backfill while CH is restarting).
#
# Usage (VM):
#   bash /var/www/pump/tma/deploy/vm/f0-ch-recover.sh
#   RESTART_CH=1 bash ...   # optional: docker restart pump-clickhouse first
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
INDEXER_ENV="${TMA_DIR}/apps/indexer-sol/.env"
RESTART_CH="${RESTART_CH:-0}"
WAIT_SECS="${WAIT_SECS:-90}"

log() { echo "[f0-ch-recover] $*"; }

wait_clickhouse() {
  log "Waiting for ClickHouse HTTP ping (max ${WAIT_SECS}s)…"
  for i in $(seq 1 "$WAIT_SECS"); do
    if curl -sf "http://127.0.0.1:8123/ping" >/dev/null 2>&1; then
      log "ClickHouse ping OK (${i}s)"
      return 0
    fi
    sleep 1
  done
  log "ERROR: ClickHouse did not respond — check: docker logs pump-clickhouse --tail 40"
  return 1
}

if [[ "$RESTART_CH" == "1" ]]; then
  log "Restarting pump-clickhouse…"
  docker restart pump-clickhouse
fi

wait_clickhouse

log "memory.xml (mounted):"
docker exec pump-clickhouse cat /etc/clickhouse-server/config.d/memory.xml 2>/dev/null || true

log "CH counts before backfill:"
docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.candles_spot" 2>/dev/null || echo "candles_spot: (query failed)"
docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.trades_raw" 2>/dev/null || echo "trades_raw: (query failed)"

log "Backfill candles_spot from PG…"
bash "${TMA_DIR}/deploy/vm/backfill-clickhouse-candles.sh"

log "Backfill trades_raw from PG…"
if [[ -f "$INDEXER_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$INDEXER_ENV" 2>/dev/null || true
  set +a
fi
cd "$TMA_DIR"
TRADES_JS="${TMA_DIR}/apps/indexer-sol/dist/backfill-clickhouse-trades.js"
if [[ -f "$TRADES_JS" ]]; then
  node "$TRADES_JS" || log "WARN: trades backfill failed — non-fatal for candle parity"
else
  npm run backfill-clickhouse-trades -w @pump/indexer-sol 2>/dev/null || \
    log "WARN: trades backfill skipped (dist missing)"
fi

log "CH counts after backfill:"
docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.candles_spot" 2>/dev/null || true
docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.trades_raw" 2>/dev/null || true

log "Sample tokens in CH candles_spot:"
docker exec pump-clickhouse clickhouse-client -q \
  "SELECT token_address, candle_interval, count() AS n FROM pump.candles_spot GROUP BY 1, 2 ORDER BY n DESC LIMIT 5" 2>/dev/null || true

log "Running check-chart-parity…"
set +e
bash "${TMA_DIR}/deploy/vm/check-chart-parity.sh"
PARITY=$?
set -e

if [[ "$PARITY" -eq 0 ]]; then
  log "F0 parity GREEN — gate for F2 CLICKHOUSE_VIA_REDIS_STREAM=true"
else
  log "F0 parity not green (exit=$PARITY) — fix INC-001 before F2 stream cutover"
  log "  compared_ch=0 → CH query empty or token mismatch; re-run after CH stable"
fi

exit "$PARITY"

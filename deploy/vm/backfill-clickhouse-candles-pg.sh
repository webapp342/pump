#!/usr/bin/env bash
# Backfill pump.candles_spot from PostgreSQL token_candles — no Node build required.
# Uses psql + ClickHouse HTTP JSONEachRow insert.
#
#   bash deploy/vm/backfill-clickhouse-candles-pg.sh
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
ENV_FILE="${TMA_DIR}/apps/indexer-sol/.env"
CH_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
CH_DB="${CLICKHOUSE_DATABASE:-pump}"
PG_DB="${PGDATABASE:-pump_db}"
BATCH=200

log() { echo "[backfill-ch-candles-pg] $*"; }

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

CH_URL="${CLICKHOUSE_URL:-$CH_URL}"
CH_DB="${CLICKHOUSE_DATABASE:-$CH_DB}"

if ! curl -sf "${CH_URL%/}/ping" >/dev/null; then
  log "ERROR: ClickHouse not reachable at $CH_URL"
  exit 1
fi

if ! sudo -u postgres psql -d "$PG_DB" -c "SELECT 1 FROM token_candles LIMIT 1" >/dev/null 2>&1; then
  log "ERROR: cannot read token_candles from $PG_DB"
  exit 1
fi

TOTAL="$(sudo -u postgres psql -d "$PG_DB" -t -A -c "SELECT COUNT(*) FROM token_candles")"
log "PG token_candles rows=$TOTAL"

OFFSET=0
INSERTED=0

while [[ "$OFFSET" -lt "$TOTAL" ]]; do
  BODY="$(
    sudo -u postgres psql -d "$PG_DB" -t -A -c "
      SELECT row_to_json(r)::text
      FROM (
        SELECT
          token_address,
          candle_interval,
          to_char(bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS bucket_start,
          open_zug::float8 AS open_sol,
          high_zug::float8 AS high_sol,
          low_zug::float8 AS low_sol,
          close_zug::float8 AS close_sol,
          volume_zug::float8 AS volume_sol,
          buy_volume_zug::float8 AS buy_volume_sol,
          trade_count::int AS trade_count
        FROM token_candles
        ORDER BY token_address, candle_interval, bucket_ts
        LIMIT ${BATCH} OFFSET ${OFFSET}
      ) r
    "
  )"

  if [[ -z "${BODY//[$'\n\r']/}" ]]; then
    break
  fi

  # psql -t may return multiple JSON lines
  JSON_LINES="$(echo "$BODY" | sed '/^[[:space:]]*$/d')"
  if [[ -z "$JSON_LINES" ]]; then
    break
  fi

  COUNT="$(echo "$JSON_LINES" | wc -l | tr -d ' ')"
  HTTP_CODE="$(
    echo "$JSON_LINES" | curl -sf -w "%{http_code}" -o /tmp/ch_candles_backfill.out \
      "${CH_URL%/}/?database=${CH_DB}&query=INSERT%20INTO%20candles_spot%20FORMAT%20JSONEachRow" \
      --data-binary @- \
      -H "Content-Type: application/json" || echo "000"
  )"

  if [[ "$HTTP_CODE" != "200" ]]; then
    log "ERROR: ClickHouse insert failed HTTP $HTTP_CODE"
    cat /tmp/ch_candles_backfill.out 2>/dev/null || true
    exit 1
  fi

  INSERTED=$((INSERTED + COUNT))
  OFFSET=$((OFFSET + BATCH))
  log "… inserted batch ($INSERTED / $TOTAL)"
done

CH_COUNT="$(docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM ${CH_DB}.candles_spot" 2>/dev/null || echo "?")"
log "DONE inserted≈$INSERTED CH candles_spot count=$CH_COUNT"

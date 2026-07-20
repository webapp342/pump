#!/usr/bin/env bash
# Build @pump/indexer-sol from monorepo (workspace deps need root package-lock).
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
INDEXER_APP="${TMA_DIR}/apps/indexer-sol"
LEGACY_ENV_DIR="${INDEXER_SOL_DIR:-/var/www/pump/indexer-sol}"
SERVICE="${INDEXER_SOL_SERVICE:-pump-indexer-sol}"
ENV_FILE="${INDEXER_APP}/.env"

log() { echo "[indexer-sol-deploy] $*"; }

if [[ ! -d "$INDEXER_APP/src" ]]; then
  log "Missing $INDEXER_APP/src — skip Solana indexer"
  exit 0
fi

TMA_ENV="${TMA_DIR}/.env"
if [[ -f "$TMA_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$TMA_ENV" 2>/dev/null || true
  set +a
fi

# Migrate legacy .env from /var/www/pump/indexer-sol if present
if [[ ! -f "$ENV_FILE" && -f "$LEGACY_ENV_DIR/.env" ]]; then
  log "Migrating $LEGACY_ENV_DIR/.env → $ENV_FILE"
  cp "$LEGACY_ENV_DIR/.env" "$ENV_FILE"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  log "Creating $ENV_FILE from tma .env"
  {
    echo "LAUNCHPAD_DATABASE_URL=${LAUNCHPAD_DATABASE_URL:-${DATABASE_URL:-}}"
    echo "SOLANA_RPC_URL=${SOLANA_RPC_URL:-${NEXT_PUBLIC_SOLANA_RPC_URL:-https://api.devnet.solana.com}}"
    echo "SOLANA_CLUSTER=${SOLANA_CLUSTER:-${NEXT_PUBLIC_SOLANA_CLUSTER:-devnet}}"
    echo "SOLANA_CHAIN_ID=${SOLANA_CHAIN_ID:-901103}"
    echo "SOLANA_FACTORY_PROGRAM_ID=${NEXT_PUBLIC_SOLANA_FACTORY_PROGRAM_ID:-Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus}"
    echo "SOLANA_CURVE_PROGRAM_ID=${NEXT_PUBLIC_SOLANA_CURVE_PROGRAM_ID:-Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus}"
    echo "SOLANA_TREASURY_PROGRAM_ID=${NEXT_PUBLIC_SOLANA_TREASURY_PROGRAM_ID:-Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus}"
    echo "SOLANA_INDEXER_SOURCE=rpc"
    echo "SOLANA_INDEXER_POLL_MS=2000"
    echo "INCREMENTAL_BOARD_STATS=true"
    echo "INCREMENTAL_CANDLES=true"
    echo "REDIS_PUBLISH_ENABLED=true"
    echo "REDIS_URL=${REDIS_URL:-redis://127.0.0.1:6379}"
    echo "CLICKHOUSE_URL=${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
    echo "CLICKHOUSE_DUAL_WRITE=${CLICKHOUSE_DUAL_WRITE:-true}"
    echo "CLICKHOUSE_DATABASE=${CLICKHOUSE_DATABASE:-pump}"
  } > "$ENV_FILE"
fi

# Always keep realtime + CH flags present on existing envs
ensure_env() {
  local key="$1" value="$2"
  if ! grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}
ensure_env "REDIS_PUBLISH_ENABLED" "true"
ensure_env "REDIS_URL" "${REDIS_URL:-redis://127.0.0.1:6379}"
ensure_env "CLICKHOUSE_URL" "${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
ensure_env "CLICKHOUSE_DUAL_WRITE" "true"
ensure_env "CLICKHOUSE_DATABASE" "pump"

log "Building indexer-sol from monorepo (requires root npm ci from tma-deploy)"
cd "$TMA_DIR"
if [[ ! -f package-lock.json ]]; then
  log "ERROR: $TMA_DIR/package-lock.json missing — run npm ci at repo root first"
  exit 1
fi
npm run build -w @pump/solana-sdk
npm run build -w @pump/indexer-sol

if [[ ! -f "$INDEXER_APP/dist/indexer.js" ]]; then
  log "Build failed: $INDEXER_APP/dist/indexer.js missing"
  exit 1
fi

# Refresh systemd unit (WorkingDirectory = monorepo app path)
if [[ -f "$TMA_DIR/deploy/pump-indexer-sol.service" ]]; then
  cp "$TMA_DIR/deploy/pump-indexer-sol.service" /etc/systemd/system/
  systemctl daemon-reload
fi

if systemctl list-unit-files | grep -q "^${SERVICE}.service"; then
  log "Restarting $SERVICE"
  systemctl restart "$SERVICE"
  sleep 2
  if journalctl -u "$SERVICE" -n 20 --no-pager 2>/dev/null | grep -qi 'ready\|solana indexer'; then
    log "Indexer-sol restarted"
  else
    log "WARN: check journalctl -u $SERVICE"
    journalctl -u "$SERVICE" -n 15 --no-pager || true
  fi
else
  log "WARN: systemd unit $SERVICE not installed — run:"
  log "  cp deploy/pump-indexer-sol.service /etc/systemd/system/"
  log "  systemctl daemon-reload && systemctl enable --now pump-indexer-sol"
fi

log "Indexer-sol deploy finished (app=$INDEXER_APP)"

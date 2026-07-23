#!/usr/bin/env bash
# Build + restart pump-indexer-sol-go (F5 primary). Retires TS pump-indexer-sol on success.
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
GO_APP="${TMA_DIR}/apps/indexer-sol-go"
TS_ENV="${TMA_DIR}/apps/indexer-sol/.env"
GO_ENV="${GO_APP}/.env"
SERVICE="${INDEXER_SOL_GO_SERVICE:-pump-indexer-sol-go}"
TS_SERVICE="${INDEXER_SOL_SERVICE:-pump-indexer-sol}"

log() { echo "[indexer-sol-go-deploy] $*"; }

# shellcheck source=deploy/vm/ensure-go-path.sh
source "$(dirname "$0")/ensure-go-path.sh"
ensure_go_path || true

if [[ ! -d "$GO_APP/cmd/indexer" ]]; then
  log "Missing $GO_APP — skip Go indexer"
  exit 0
fi

if ! command -v go >/dev/null 2>&1; then
  if [[ "${INDEXER_DEPLOY_REQUIRED:-}" == "1" ]]; then
    log "ERROR: Go not installed — install Go 1.25.1+ (https://go.dev/dl/)"
    exit 1
  fi
  log "WARN: Go not on PATH — skip indexer build (try: export PATH=/usr/local/go/bin:\$PATH)"
  exit 0
fi

# Bootstrap .env
if [[ ! -f "$GO_ENV" && -f "$GO_APP/.env.example" ]]; then
  cp "$GO_APP/.env.example" "$GO_ENV"
  log "Created $GO_ENV from .env.example"
fi

merge_env_from_ts() {
  local key="$1"
  [[ -f "$GO_ENV" ]] || return 0
  if grep -qE "^${key}=" "$GO_ENV" 2>/dev/null; then
    return 0
  fi
  [[ -f "$TS_ENV" ]] || return 0
  local line
  line="$(grep -E "^${key}=" "$TS_ENV" | tail -1 || true)"
  [[ -n "$line" ]] || return 0
  printf '%s\n' "$line" >> "$GO_ENV"
  log "Merged $key from indexer-sol/.env"
}

if [[ -f "$GO_ENV" ]]; then
  for key in \
    LAUNCHPAD_DATABASE_URL REDIS_URL REDIS_PUBLISH_ENABLED \
    CLICKHOUSE_VIA_REDIS_STREAM SKIP_PG_TOKEN_CANDLES USE_REDIS_WEEKLY_XP \
    INCREMENTAL_CANDLES SOLANA_CLUSTER SOLANA_CHAIN_ID SOLANA_TOKEN_DECIMALS \
    HELIUS_API_KEY SOLANA_GEYSER_ENDPOINT SOLANA_GEYSER_PROGRAM_IDS
  do
    merge_env_from_ts "$key"
  done
  # Primary cutover default when TS env had publish enabled
  if ! grep -qE '^GO_SHADOW_MODE=' "$GO_ENV" 2>/dev/null; then
    echo "GO_SHADOW_MODE=primary" >> "$GO_ENV"
    log "Set GO_SHADOW_MODE=primary"
  fi
fi

log "Building Go indexer (skip tests on deploy — use build-indexer-sol-go.sh locally for test)"
cd "$GO_APP"
export GOTOOLCHAIN=local
go mod download
mkdir -p bin
go build -o bin/indexer-sol-go ./cmd/indexer
chmod +x bin/indexer-sol-go

if [[ ! -x "$GO_APP/bin/indexer-sol-go" ]]; then
  log "Build failed: bin/indexer-sol-go missing"
  exit 1
fi

if [[ -f "$TMA_DIR/deploy/vm/pump-indexer-sol-go.service" ]]; then
  cp "$TMA_DIR/deploy/vm/pump-indexer-sol-go.service" /etc/systemd/system/
  systemctl daemon-reload
fi

log "Enabling + restarting $SERVICE"
systemctl enable "$SERVICE" 2>/dev/null || true
systemctl restart "$SERVICE"
sleep 2

if journalctl -u "$SERVICE" -n 25 --no-pager 2>/dev/null | grep -qiE 'runner|LaserStream|indexer-sol-go'; then
  log "$SERVICE restarted OK"
else
  log "WARN: check journalctl -u $SERVICE"
  journalctl -u "$SERVICE" -n 20 --no-pager || true
fi

# TS indexer retired (F5d)
if systemctl is-enabled "$TS_SERVICE" &>/dev/null; then
  log "Disabling legacy $TS_SERVICE"
  systemctl stop "$TS_SERVICE" 2>/dev/null || true
  systemctl disable "$TS_SERVICE" 2>/dev/null || true
fi

log "Go indexer deploy finished (app=$GO_APP)"

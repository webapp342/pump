#!/usr/bin/env bash
# Sync Solana indexer from monorepo, rebuild, restart systemd.
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
INDEXER_SRC="${TMA_DIR}/apps/indexer-sol"
INDEXER_DIR="${INDEXER_SOL_DIR:-/var/www/pump/indexer-sol}"
SERVICE="${INDEXER_SOL_SERVICE:-pump-indexer-sol}"

log() { echo "[indexer-sol-deploy] $*"; }

if [[ ! -d "$INDEXER_SRC/src" ]]; then
  log "Missing $INDEXER_SRC/src — skip Solana indexer"
  exit 0
fi

TMA_ENV="${TMA_DIR}/.env"
if [[ -f "$TMA_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$TMA_ENV" 2>/dev/null || true
  set +a
fi

log "Sync indexer-sol (preserve $INDEXER_DIR/.env)"
mkdir -p "$INDEXER_DIR"
rsync -a --exclude '.env' --exclude 'node_modules' --exclude 'dist' "$INDEXER_SRC/" "$INDEXER_DIR/"

# Seed .env from tma root if missing
if [[ ! -f "$INDEXER_DIR/.env" ]]; then
  log "Creating $INDEXER_DIR/.env from tma .env"
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
  } > "$INDEXER_DIR/.env"
fi

log "Installing dependencies"
cd "$INDEXER_DIR"
npm ci

log "Building indexer-sol"
npm run build

if [[ ! -f "$INDEXER_DIR/dist/indexer.js" ]]; then
  log "Build failed: dist/indexer.js missing"
  exit 1
fi

if systemctl list-unit-files | grep -q "^${SERVICE}.service"; then
  log "Restarting $SERVICE"
  systemctl restart "$SERVICE"
  sleep 2
  if journalctl -u "$SERVICE" -n 20 --no-pager 2>/dev/null | grep -qi 'ready\|listening\|started'; then
    log "Indexer-sol restarted"
  else
    log "WARN: check journalctl -u $SERVICE"
    journalctl -u "$SERVICE" -n 15 --no-pager || true
  fi
else
  log "WARN: systemd unit $SERVICE not installed — run deploy/pump-indexer-sol.service once"
  log "  Manual: cd $INDEXER_DIR && npm run indexer"
fi

log "Indexer-sol deploy finished"

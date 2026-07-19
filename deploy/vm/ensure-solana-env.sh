#!/usr/bin/env bash
# Ensure VM .env has Solana production defaults before Next.js build.
# Called by deploy/tma-deploy.sh and deploy/ui-deploy.sh.
set -euo pipefail

ENV_FILE="${1:-${REPO_ROOT:-/var/www/pump/tma}/.env}"

log() { echo "[ensure-solana-env] $*"; }

if [[ ! -f "$ENV_FILE" ]]; then
  log "WARN: $ENV_FILE missing — create from .env.example before deploy"
  return 0 2>/dev/null || exit 0
fi

# Pinocchio launchpad — single program ID (factory / curve / treasury)
PROGRAM_ID="${SOLANA_LAUNCHPAD_PROGRAM_ID:-Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus}"
CLUSTER="${NEXT_PUBLIC_SOLANA_CLUSTER:-devnet}"

# Keep existing Helius/custom RPC if already in .env
existing_rpc=""
if grep -qE '^[[:space:]]*NEXT_PUBLIC_SOLANA_RPC_URL=' "$ENV_FILE"; then
  existing_rpc="$(grep -E '^[[:space:]]*NEXT_PUBLIC_SOLANA_RPC_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
fi
RPC="${existing_rpc:-${NEXT_PUBLIC_SOLANA_RPC_URL:-https://api.devnet.solana.com}}"

set_kv() {
  local key="$1"
  local value="$2"
  if grep -qE "^[[:space:]]*${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|g" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

log "Setting NEXT_PUBLIC_CHAIN_FAMILY=solana (production cutover)"
set_kv "NEXT_PUBLIC_CHAIN_FAMILY" "solana"
set_kv "NEXT_PUBLIC_SOLANA_CLUSTER" "$CLUSTER"
set_kv "NEXT_PUBLIC_SOLANA_RPC_URL" "$RPC"
set_kv "NEXT_PUBLIC_SOLANA_FACTORY_PROGRAM_ID" "$PROGRAM_ID"
set_kv "NEXT_PUBLIC_SOLANA_CURVE_PROGRAM_ID" "$PROGRAM_ID"
set_kv "NEXT_PUBLIC_SOLANA_TREASURY_PROGRAM_ID" "$PROGRAM_ID"

# Server-side Solana RPC (wallet API, optional server reads)
set_kv "SOLANA_RPC_URL" "$RPC"
set_kv "SOLANA_CLUSTER" "$CLUSTER"

# DB chain id for Solana rows (devnet default)
if ! grep -qE '^[[:space:]]*SOLANA_CHAIN_ID=' "$ENV_FILE"; then
  case "$CLUSTER" in
    mainnet|mainnet-beta) set_kv "SOLANA_CHAIN_ID" "901101" ;;
    localnet|local) set_kv "SOLANA_CHAIN_ID" "901100" ;;
    *) set_kv "SOLANA_CHAIN_ID" "901103" ;;
  esac
fi

# EVM bundler / flashblocks not used on Solana path
set_kv "SKIP_EVM_INDEXER" "1"
set_kv "SKIP_ALTO_BUNDLER" "${SKIP_ALTO_BUNDLER:-1}"

log "Solana env OK — cluster=$CLUSTER program=$PROGRAM_ID"

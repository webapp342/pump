#!/usr/bin/env bash
# Self-host Alto bundler (EntryPoint 0.7) — same engine Pimlico runs in production.
# Docs: .cursor/docs/self-hosted-bundler-2026.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALTO_DIR="${ALTO_DIR:-/opt/alto}"
ALTO_PORT="${ALTO_PORT:-4337}"
CHAIN_ID="${BUNDLER_CHAIN_ID:-97}"

# Skandha migration: reuse relayer key if executor keys not set
if [[ -z "${BUNDLER_EXECUTOR_PRIVATE_KEYS:-}" && -n "${BUNDLER_RELAYER_PRIVATE_KEY:-}" ]]; then
  export BUNDLER_EXECUTOR_PRIVATE_KEYS="$BUNDLER_RELAYER_PRIVATE_KEY"
  echo "Using BUNDLER_RELAYER_PRIVATE_KEY as executor."
fi
if [[ -z "${BUNDLER_UTILITY_PRIVATE_KEY:-}" && -n "${BUNDLER_RELAYER_PRIVATE_KEY:-}" ]]; then
  export BUNDLER_UTILITY_PRIVATE_KEY="$BUNDLER_RELAYER_PRIVATE_KEY"
  echo "Using BUNDLER_RELAYER_PRIVATE_KEY as utility wallet."
fi

if [[ -z "${BUNDLER_EXECUTOR_PRIVATE_KEYS:-}" ]]; then
  echo "Set BUNDLER_EXECUTOR_PRIVATE_KEYS (comma-separated 0x… keys, 2+ recommended)."
  exit 1
fi
if [[ -z "${BUNDLER_UTILITY_PRIVATE_KEY:-}" ]]; then
  echo "Set BUNDLER_UTILITY_PRIVATE_KEY (0x… funds executor refill)."
  exit 1
fi

if [[ -n "${BUNDLER_CHAIN_RPC_URL:-}" ]]; then
  CHAIN_RPC="$BUNDLER_CHAIN_RPC_URL"
elif [[ -n "${ALCHEMY_API_KEY:-}" ]]; then
  CHAIN_RPC="https://bnb-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
else
  echo "Set BUNDLER_CHAIN_RPC_URL or ALCHEMY_API_KEY (paid tier recommended for bundler getLogs)."
  exit 1
fi

# Alchemy free tier: cap getLogs range (Alto default 2000 exceeds free limit)
MAX_BLOCK_RANGE="${ALTO_MAX_BLOCK_RANGE:-128}"
if [[ "${ALCHEMY_FREE_TIER:-}" == "1" ]]; then
  MAX_BLOCK_RANGE=9
  echo "ALCHEMY_FREE_TIER=1 → max-block-range=9 (upgrade to PAYG for production)."
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found."
  exit 1
fi

ensure_build_deps() {
  local missing=()
  for cmd in git curl python3; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if ! command -v forge >/dev/null 2>&1; then
    echo "Installing Foundry (forge) for Alto contract builds…"
    curl -L https://foundry.paradigm.xyz | bash
    export PATH="$HOME/.foundry/bin:${PATH:-}"
    foundryup || true
  fi
  if [[ ${#missing[@]} -gt 0 ]] && command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl python3 ca-certificates build-essential
  fi
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]]; then
    echo "Node.js 18+ required for Alto."
    exit 1
  fi
}

ensure_build_deps

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Installing pnpm…"
  npm install -g pnpm
fi

if [[ ! -d "$ALTO_DIR/.git" ]]; then
  echo "Cloning Alto into $ALTO_DIR…"
  git clone --depth 1 https://github.com/pimlicolabs/alto.git "$ALTO_DIR"
fi

cd "$ALTO_DIR"
pnpm install
pnpm build:contracts
pnpm build

CONFIG="$ALTO_DIR/alto-config.json"
python3 <<PY
import json
from pathlib import Path

cfg = {
    "entrypoints": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    "executor-private-keys": "${BUNDLER_EXECUTOR_PRIVATE_KEYS}",
    "utility-private-key": "${BUNDLER_UTILITY_PRIVATE_KEY}",
    "rpc-url": "${CHAIN_RPC}",
    "safe-mode": False,
    "legacy-transactions": True,
    "port": ${ALTO_PORT},
    "block-time": 3000,
    "max-block-range": ${MAX_BLOCK_RANGE},
    "floor-max-fee-per-gas": "1",
    "floor-max-priority-fee-per-gas": "1",
    "min-executor-balance": "10000000000000000",
    "default-api-version": "v2",
    "api-version": "v1,v2",
    "flush-stuck-transactions-during-startup": True,
}
Path("${CONFIG}").write_text(json.dumps(cfg, indent=2) + "\n")
print("Wrote", "${CONFIG}")
PY

pm2 delete pump-skandha 2>/dev/null || true
pm2 delete pump-alto 2>/dev/null || true
pm2 start "$ROOT/ecosystem.alto.config.cjs"
pm2 save

echo ""
echo "Alto: http://127.0.0.1:${ALTO_PORT}/rpc  (health: /health)"
echo "TMA .env: BUNDLER_RPC_URL=http://127.0.0.1:${ALTO_PORT}/rpc"
echo "Remove PIMLICO_API_KEY from TMA .env"
echo "Test: bash $ROOT/health.sh"

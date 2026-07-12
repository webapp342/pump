#!/usr/bin/env bash
# Self-host Alto bundler (EntryPoint 0.7) — same engine Pimlico runs in production.
# Docs: .cursor/docs/self-hosted-bundler-2026.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALTO_DIR="${ALTO_DIR:-/opt/alto}"
ALTO_PORT="${ALTO_PORT:-4337}"
CHAIN_ID="${BUNDLER_CHAIN_ID:-84532}"

# bootstrap.env uses ALCHEMY_RPC_KEY; legacy scripts use ALCHEMY_API_KEY
if [[ -z "${ALCHEMY_API_KEY:-}" && -n "${ALCHEMY_RPC_KEY:-}" ]]; then
  export ALCHEMY_API_KEY="$ALCHEMY_RPC_KEY"
fi

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
  case "$CHAIN_ID" in
    84532) CHAIN_RPC="https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}" ;;
    8453)  CHAIN_RPC="https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}" ;;
    *)     CHAIN_RPC="https://bnb-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}" ;;
  esac
else
  echo "Set BUNDLER_CHAIN_RPC_URL or ALCHEMY_API_KEY (paid tier recommended for bundler getLogs)."
  exit 1
fi

# Chain-specific Alto timing (see Alto CLI: block-time, max-bundle-interval, chain-type)
case "$CHAIN_ID" in
  84532|8453)
    LEGACY_TX="False"
    CHAIN_TYPE="${ALTO_CHAIN_TYPE:-op-stack}"
    BLOCK_TIME="${ALTO_BLOCK_TIME_MS:-2000}"
    MAX_BUNDLE_INTERVAL="${ALTO_MAX_BUNDLE_INTERVAL_MS:-400}"
    MIN_BUNDLE_INTERVAL="${ALTO_MIN_BUNDLE_INTERVAL_MS:-100}"
    NETWORK_NAME="${ALTO_NETWORK_NAME:-$([ "$CHAIN_ID" = "84532" ] && echo base-sepolia || echo base)}"
    FLOOR_MAX_FEE="${ALTO_FLOOR_MAX_FEE_PER_GAS:-0.001}"
    FLOOR_PRIORITY="${ALTO_FLOOR_MAX_PRIORITY_FEE_PER_GAS:-0.001}"
    EXECUTOR_GAS_MULT="${ALTO_EXECUTOR_GAS_MULTIPLIER:-110}"
    ;;
  *)
    LEGACY_TX="True"
    CHAIN_TYPE="${ALTO_CHAIN_TYPE:-default}"
    BLOCK_TIME="${ALTO_BLOCK_TIME_MS:-3000}"
    MAX_BUNDLE_INTERVAL="${ALTO_MAX_BUNDLE_INTERVAL_MS:-1000}"
    MIN_BUNDLE_INTERVAL="${ALTO_MIN_BUNDLE_INTERVAL_MS:-100}"
    NETWORK_NAME="${ALTO_NETWORK_NAME:-binance-testnet}"
    FLOOR_MAX_FEE="${ALTO_FLOOR_MAX_FEE_PER_GAS:-0.1}"
    FLOOR_PRIORITY="${ALTO_FLOOR_MAX_PRIORITY_FEE_PER_GAS:-0.1}"
    EXECUTOR_GAS_MULT="${ALTO_EXECUTOR_GAS_MULTIPLIER:-105}"
    ;;
esac
echo "Alto chain $CHAIN_ID: legacy=$LEGACY_TX block-time=${BLOCK_TIME}ms bundle-interval=${MIN_BUNDLE_INTERVAL}-${MAX_BUNDLE_INTERVAL}ms chain-type=$CHAIN_TYPE"

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

legacy_tx = "${LEGACY_TX}" == "True"
cfg = {
    "entrypoints": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    "executor-private-keys": "${BUNDLER_EXECUTOR_PRIVATE_KEYS}",
    "utility-private-key": "${BUNDLER_UTILITY_PRIVATE_KEY}",
    "rpc-url": "${CHAIN_RPC}",
    "safe-mode": False,
    "legacy-transactions": legacy_tx,
    "chain-type": "${CHAIN_TYPE}",
    "network-name": "${NETWORK_NAME}",
    "port": ${ALTO_PORT},
    "block-time": ${BLOCK_TIME},
    "min-bundle-interval": ${MIN_BUNDLE_INTERVAL},
    "max-bundle-interval": ${MAX_BUNDLE_INTERVAL},
    "executor-gas-multiplier": "${EXECUTOR_GAS_MULT}",
    "max-block-range": ${MAX_BLOCK_RANGE},
    "floor-max-fee-per-gas": "${FLOOR_MAX_FEE}",
    "floor-max-priority-fee-per-gas": "${FLOOR_PRIORITY}",
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

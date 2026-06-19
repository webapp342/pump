#!/usr/bin/env bash
# Self-host Skandha bundler (EntryPoint 0.7) via PM2 — no Docker.
# Recommended for Pump VM: lowest idle RAM vs dockerd + container.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_SRC="$ROOT/skandha.config.json"
SKANDHA_DIR="${SKANDHA_DIR:-/opt/skandha}"
SKANDHA_BRANCH="${SKANDHA_BRANCH:-releases/v0.7}"

if [[ -z "${BUNDLER_RELAYER_PRIVATE_KEY:-}" ]]; then
  echo "Set BUNDLER_RELAYER_PRIVATE_KEY (0x… funded with BNB on BSC testnet)."
  exit 1
fi

RPC="${BSC_RPC_URL:-https://bsc-testnet-rpc.publicnode.com}"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found. Install: npm i -g pm2"
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Installing bun…"
  curl -fsSL https://bun.sh/install | bash
  export BUN="$HOME/.bun/bin/bun"
  export PATH="$HOME/.bun/bin:$PATH"
fi

if [[ ! -d "$SKANDHA_DIR/.git" ]]; then
  echo "Cloning Skandha ($SKANDHA_BRANCH) into $SKANDHA_DIR…"
  git clone --depth 1 -b "$SKANDHA_BRANCH" https://github.com/etherspot/skandha "$SKANDHA_DIR"
fi

python3 - <<PY
import json
from pathlib import Path

src = Path("$CONFIG_SRC")
dst = Path("$SKANDHA_DIR/config.json")
data = json.loads(src.read_text())
data["relayers"] = ["${BUNDLER_RELAYER_PRIVATE_KEY}"]
data["rpcEndpoint"] = "${RPC}"
dst.write_text(json.dumps(data, indent=2) + "\n")
print("Wrote", dst)
PY

cd "$SKANDHA_DIR"

if [[ ! -x "./skandha" ]]; then
  echo "Building Skandha (one-time, ~3–8 min)…"
  bun install
  if [[ -d node_modules/bcrypto ]]; then
    (cd node_modules/bcrypto && bun install)
  fi
  bun run build
  chmod +x ./skandha 2>/dev/null || true
fi

if [[ ! -f "./skandha" ]] && [[ ! -x "./skandha" ]]; then
  echo "Build finished but ./skandha binary not found. Check $SKANDHA_DIR"
  exit 1
fi

pm2 delete pump-skandha 2>/dev/null || true
pm2 start "$ROOT/ecosystem.skandha.config.cjs"
pm2 save

echo ""
echo "Skandha (PM2) listening on http://127.0.0.1:14337/rpc"
echo "TMA .env: BUNDLER_RPC_URL=http://127.0.0.1:14337/rpc"
echo "Logs: pm2 logs pump-skandha"

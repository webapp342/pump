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

ensure_build_deps() {
  local missing=()
  for cmd in git curl python3 unzip make g++; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -eq 0 ]]; then
    return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    echo "Installing build deps: ${missing[*]}…"
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl python3 unzip ca-certificates build-essential
  else
    echo "Missing: ${missing[*]}. Install manually (e.g. apt install build-essential unzip git curl python3)."
    exit 1
  fi
}

find_bcrypto_node() {
  find "$SKANDHA_DIR/node_modules/bcrypto" -name 'bcrypto.node' -print -quit 2>/dev/null || true
}

ensure_bcrypto_native() {
  local node_file
  node_file="$(find_bcrypto_node)"
  if [[ -n "$node_file" ]]; then
    echo "bcrypto native OK: $node_file"
    return 0
  fi
  echo "Building bcrypto native module (requires make/gcc)…"
  (cd "$SKANDHA_DIR/node_modules/bcrypto" && bun install && make -j"$(nproc 2>/dev/null || echo 2)")
  node_file="$(find_bcrypto_node)"
  if [[ -z "$node_file" ]]; then
    echo "bcrypto.node still missing after make — try: cd $SKANDHA_DIR && rm -rf node_modules && bun install && bun run build"
    exit 1
  fi
  echo "bcrypto native OK: $node_file"
}

ensure_build_deps

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found. Install: npm i -g pm2"
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  ensure_build_deps
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

SKANDHA_CLI_LIB="$SKANDHA_DIR/packages/cli/lib/index.js"
if [[ ! -f "$SKANDHA_CLI_LIB" ]]; then
  echo "Building Skandha (one-time, ~3–8 min)…"
  bun install
  ensure_bcrypto_native
  bun run build
else
  ensure_bcrypto_native
fi

if [[ ! -f "$SKANDHA_CLI_LIB" ]]; then
  echo "Build failed — missing $SKANDHA_CLI_LIB"
  exit 1
fi

pm2 delete pump-skandha 2>/dev/null || true
pm2 start "$ROOT/ecosystem.skandha.config.cjs"
pm2 save

echo ""
echo "Skandha (PM2) listening on http://127.0.0.1:14337/rpc"
echo "TMA .env: BUNDLER_RPC_URL=http://127.0.0.1:14337/rpc"
echo "Logs: pm2 logs pump-skandha"

#!/usr/bin/env bash
# Deploy Pinocchio pump-launchpad to devnet (Helius or public RPC)
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
source "$HOME/.cargo/env" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="$REPO_ROOT/programs/pump-launchpad"
SO="$ROOT/target/deploy/pump_launchpad.so"
KEY="$ROOT/keys/pump_launchpad-keypair.json"
URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"

if [ ! -f "$SO" ]; then
  bash "$SCRIPT_DIR/wsl-pinocchio-build.sh"
fi

PID=$(solana-keygen pubkey "$KEY")
echo "Deploying $PID → $URL"
solana program deploy "$SO" \
  --program-id "$KEY" \
  --url "$URL" \
  --keypair "${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

echo "OK program $PID"
solana program show "$PID" --url "$URL" | head -20

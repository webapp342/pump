#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
source "$HOME/.cargo/env" 2>/dev/null || true
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="$REPO_ROOT/programs/pump-launchpad"
cd "$ROOT"
cargo-build-sbf
SO="$ROOT/target/deploy/pump_launchpad.so"
echo "bytes=$(stat -c%s "$SO") rent:"
solana rent "$(stat -c%s "$SO")"
echo "PROGRAM_ID=$(solana-keygen pubkey "$ROOT/keys/pump_launchpad-keypair.json")"

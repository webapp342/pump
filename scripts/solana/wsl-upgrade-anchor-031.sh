#!/usr/bin/env bash
# Upgrade WSL toolchain to Solana 2.1 + Anchor 0.31 (cargo can parse edition2024 crates).
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/.avm/bin:$PATH"
. "$HOME/.cargo/env" 2>/dev/null || true

SOLANA_VER="${SOLANA_VER:-v2.1.21}"
ANCHOR_VER="${ANCHOR_VER:-0.31.1}"

echo "=== install Solana $SOLANA_VER ==="
curl -sSfL "https://release.anza.xyz/${SOLANA_VER}/install" -o /tmp/solana-install.sh
sh /tmp/solana-install.sh
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version

echo "=== install Anchor $ANCHOR_VER ==="
rustup default stable
# avm may already exist
if ! command -v avm >/dev/null; then
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
fi
avm install "$ANCHOR_VER"
avm use "$ANCHOR_VER"
export PATH="$HOME/.avm/bin:$PATH"
anchor --version

grep -q 'solana/install/active_release/bin' "$HOME/.bashrc" 2>/dev/null || \
  echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$HOME/.bashrc"
grep -q '\.avm/bin' "$HOME/.bashrc" 2>/dev/null || \
  echo 'export PATH="$HOME/.avm/bin:$PATH"' >> "$HOME/.bashrc"

echo "UPGRADE_OK"

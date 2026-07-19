#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
echo "Installing Solana stable (need platform-tools rustc >= 1.85)..."
curl -sSfL https://release.anza.xyz/stable/install -o /tmp/solana-stable.sh
sh /tmp/solana-stable.sh
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version
# Trigger platform-tools download via a trivial cargo-build-sbf --version or similar
cargo-build-sbf --version || true
find "$HOME/.cache/solana" -path '*/rust/bin/rustc' -type f | while read -r f; do
  echo "== $f"; "$f" --version
done

#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/.avm/bin:$PATH"
. "$HOME/.cargo/env" 2>/dev/null || true

echo "=== status ==="
rustc --version || true
solana --version || true
avm --version || true
anchor --version || true
ls "$HOME/.avm/bin" 2>/dev/null || echo "no .avm/bin"

# Ensure rust 1.79 for building anchor 0.30.1
rustup default 1.79.0 2>/dev/null || rustup install 1.79.0 && rustup default 1.79.0
rustc --version

# Skip reinstalling avm if present
if ! command -v avm >/dev/null; then
  cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 avm --locked --force
fi

# Install anchor binary via avm (this compiles anchor-cli)
if ! anchor --version 2>/dev/null | grep -q '0.30.1'; then
  echo "=== avm install 0.30.1 (long compile) ==="
  avm install 0.30.1
  avm use 0.30.1
fi

export PATH="$HOME/.avm/bin:$PATH"
hash -r
anchor --version
solana --version

grep -q 'solana/install/active_release/bin' "$HOME/.bashrc" 2>/dev/null || \
  echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$HOME/.bashrc"
grep -q '\.cargo/env' "$HOME/.bashrc" 2>/dev/null || \
  echo '. "$HOME/.cargo/env"' >> "$HOME/.bashrc"
grep -q '\.avm/bin' "$HOME/.bashrc" 2>/dev/null || \
  echo 'export PATH="$HOME/.avm/bin:$PATH"' >> "$HOME/.bashrc"

echo "INSTALL_OK"

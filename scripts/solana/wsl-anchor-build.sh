#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/.avm/bin:$PATH"
cd /mnt/c/Users/DARK/Desktop/pump-tma/programs
avm use 0.31.1
export SBF_TOOLS_VERSION=v1.54
rm -f Cargo.lock
rustup run stable cargo generate-lockfile
sed -i 's/^version = 4$/version = 3/' Cargo.lock || true
anchor build 2>&1 | tee /tmp/ab-full.log
ls -la target/idl target/deploy
test -f target/deploy/pump_curve.so && test -f target/deploy/pump_factory.so && test -f target/deploy/pump_treasury.so
echo BUILD_OK

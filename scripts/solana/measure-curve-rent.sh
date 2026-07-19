#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd /mnt/c/Users/DARK/Desktop/pump-tma/programs/target/deploy
# Stale binaries from pre-merge workspace — ignore for rent math
rm -f pump_factory.so pump_treasury.so 2>/dev/null || true
ls -l *.so
solana rent "$(stat -c%s pump_curve.so)"

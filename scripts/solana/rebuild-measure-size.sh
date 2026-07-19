#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"
cd /mnt/c/Users/DARK/Desktop/pump-tma/programs

echo "=== BUILD (unified pump_curve) ==="
anchor build

echo "=== SIZES + RENT ==="
python3 <<'PY'
import os, subprocess, re

deploy = "target/deploy"
files = sorted(f for f in os.listdir(deploy) if f.endswith(".so"))
total = 0.0
print(f"{'program':<22} {'bytes':>10} {'rent_SOL':>12}")
for f in files:
    n = os.path.getsize(os.path.join(deploy, f))
    out = subprocess.check_output(["solana", "rent", str(n)], text=True)
    m = re.search(r"Rent-exempt minimum:\s*([0-9.]+)\s*SOL", out)
    r = float(m.group(1)) if m else 0.0
    total += r
    print(f"{f:<22} {n:>10} {r:>12.6f}")
print(f"{'TOTAL_PROGRAM_RENT':<22} {'':>10} {total:>12.6f}")
print()
print("Before opts (3 programs): ~828 KB ≈ 5.77 SOL")
print("After size opts (3):      ~612 KB ≈ 4.26 SOL")
print(f"Now (unified):           see TOTAL above")
print()
print("Mainnet wallet need ≈ TOTAL + 0.5–1.5 SOL buffer (tx fees, buffers, IDL upload, init PDAs)")
print("USD ≈ TOTAL × current SOL price")
PY

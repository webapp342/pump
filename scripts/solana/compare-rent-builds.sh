#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.avm/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:/usr/bin:$PATH"
source "$HOME/.cargo/env" 2>/dev/null || true
ROOT=/mnt/c/Users/DARK/Desktop/pump-tma/programs

echo "=== Pinocchio spike ==="
cd "$ROOT/pump-pinocchio-spike"
cargo-build-sbf
SPIKE=$(find target -name 'pump_pinocchio_spike.so' | head -1)
echo "SPIKE=$SPIKE ($(stat -c%s "$SPIKE") bytes)"
solana rent "$(stat -c%s "$SPIKE")"

echo "=== Anchor 0.32 prebuilt ==="
mkdir -p "$HOME/.avm/bin"
PREBUILT="$HOME/.avm/bin/anchor-0.32.1"
if [ ! -x "$PREBUILT" ]; then
  curl -fsSL -o "$PREBUILT.tmp" \
    "https://github.com/solana-foundation/anchor/releases/download/v0.32.1/anchor-0.32.1-x86_64-unknown-linux-gnu"
  mv "$PREBUILT.tmp" "$PREBUILT"
  chmod +x "$PREBUILT"
fi
"$PREBUILT" --version

echo "=== Try Anchor 0.32 rebuild of pump-curve ==="
cd "$ROOT"
cp -n pump-curve/Cargo.toml pump-curve/Cargo.toml.bak031 || true
sed -i 's/version = "0\.31\.1"/version = "0.32.1"/g' pump-curve/Cargo.toml
sed -i 's/anchor_version = "0\.31\.1"/anchor_version = "0.32.1"/' Anchor.toml || true
# use prebuilt as anchor
export PATH="$HOME/.avm/bin:$PATH"
ln -sfn "$PREBUILT" "$HOME/.avm/bin/anchor"

set +e
"$PREBUILT" build 2>&1 | tee /tmp/a032.log
RC=${PIPESTATUS[0]}
set -e

ANCHOR="$ROOT/target/deploy/pump_curve.so"
echo "=== RESULTS ==="
python3 - <<PY
import os, subprocess, re
rows=[]
def add(label, path):
    if not path or not os.path.isfile(path):
        print(label, "MISSING")
        return
    n=os.path.getsize(path)
    out=subprocess.check_output(["solana","rent",str(n)], text=True)
    m=re.search(r"Rent-exempt minimum:\s*([0-9.]+)\s*SOL", out)
    r=float(m.group(1)) if m else 0
    rows.append((label,n,r))
    print(f"{label:<30} {n:>10} B  {r:>10.6f} SOL  ~\${r*76:,.0f}")

add("Pinocchio_spike", "$SPIKE")
add("Anchor_pump_curve", "$ANCHOR")
print("anchor032_build_rc=", $RC)
PY

# restore toolchain pointer
avm use 0.31.1 >/dev/null 2>&1 || true
if [ "$RC" -ne 0 ]; then
  echo "Restoring Cargo.toml to 0.31.1"
  if [ -f pump-curve/Cargo.toml.bak031 ]; then
    cp pump-curve/Cargo.toml.bak031 pump-curve/Cargo.toml
  else
    sed -i 's/0\.32\.1/0.31.1/g' pump-curve/Cargo.toml
  fi
  sed -i 's/anchor_version = "0\.32\.1"/anchor_version = "0.31.1"/' Anchor.toml || true
fi

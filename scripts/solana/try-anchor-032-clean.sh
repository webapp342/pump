#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
ROOT=/mnt/c/Users/DARK/Desktop/pump-tma/programs
PREBUILT="$HOME/.avm/bin/anchor-0.32.1"
cd "$ROOT"

# Clean lock so only 0.32.1 resolves
rm -f Cargo.lock
cat > pump-curve/Cargo.toml <<'EOF'
[package]
name = "pump-curve"
version = "0.1.0"
description = "Pump bonding curve (Solana) — permanent SOL↔token curve, no graduation"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "pump_curve"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = ["no-log-ix-name", "no-idl"]
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = { version = "0.32.1", features = ["init-if-needed"] }
anchor-spl = "0.32.1"
EOF

sed -i 's/anchor_version = ".*"/anchor_version = "0.32.1"/' Anchor.toml

set +e
"$PREBUILT" build 2>&1 | tee /tmp/a032-clean.log | tail -40
RC=${PIPESTATUS[0]}
set -e

if [ "$RC" -eq 0 ]; then
  solana rent "$(stat -c%s target/deploy/pump_curve.so)"
  echo "SUCCESS Anchor 0.32 size=$(stat -c%s target/deploy/pump_curve.so)"
else
  echo "FAILED rc=$RC — restoring 0.31.1"
  cat > pump-curve/Cargo.toml <<'EOF'
[package]
name = "pump-curve"
version = "0.1.0"
description = "Pump bonding curve (Solana) — permanent SOL↔token curve, no graduation"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "pump_curve"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = ["no-log-ix-name", "no-idl"]
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = { version = "0.31.1", features = ["init-if-needed"] }
anchor-spl = "0.31.1"
EOF
  sed -i 's/anchor_version = ".*"/anchor_version = "0.31.1"/' Anchor.toml
  # rebuild 0.31 so deploy so stays valid (optional - file may still be old)
fi
exit 0

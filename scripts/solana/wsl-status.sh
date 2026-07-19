#!/usr/bin/env bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/.avm/bin:$PATH"
echo "=== versions ==="
solana --version
anchor --version
echo "=== config ==="
solana config get
echo "=== address / balance ==="
solana address || echo "NO_WALLET"
solana balance || true
echo "=== program keypairs (pubkey) ==="
for f in /mnt/c/Users/DARK/Desktop/pump-tma/programs/target/deploy/*-keypair.json; do
  [ -f "$f" ] || continue
  echo "$(basename "$f"): $(solana-keygen pubkey "$f")"
done
echo "=== declare_id in source ==="
grep -n 'declare_id!' /mnt/c/Users/DARK/Desktop/pump-tma/programs/pump-*/src/lib.rs

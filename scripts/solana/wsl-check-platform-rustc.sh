#!/usr/bin/env bash
find "$HOME/.cache/solana" -path '*/rust/bin/rustc' -type f 2>/dev/null | while read -r f; do
  echo "== $f"
  "$f" --version || true
done
ls -la "$HOME/.cache/solana"

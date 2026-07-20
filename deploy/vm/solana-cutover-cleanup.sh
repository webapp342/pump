#!/usr/bin/env bash
# One-time Solana cutover cleanup: stop EVM indexer + Alto; ensure indexer-sol.
# Run on VM: bash /var/www/pump/tma/deploy/vm/solana-cutover-cleanup.sh
set -euo pipefail

echo "== Solana cutover cleanup =="

systemctl stop pump-indexer pump-airdrop-keeper 2>/dev/null || true
systemctl disable pump-indexer pump-airdrop-keeper 2>/dev/null || true
echo "EVM indexer / airdrop-keeper: stopped+disabled (units kept for rollback)"

pm2 stop pump-alto alto 2>/dev/null || true
pm2 delete pump-alto alto 2>/dev/null || true
pm2 save 2>/dev/null || true
echo "Alto bundler: stopped/deleted from PM2"

if [[ -f /var/www/pump/tma/deploy/pump-indexer-sol.service ]]; then
  cp /var/www/pump/tma/deploy/pump-indexer-sol.service /etc/systemd/system/
  systemctl daemon-reload
fi
systemctl enable --now pump-indexer-sol
echo "pump-indexer-sol: enabled+started"

echo "--- status ---"
systemctl is-active pump-indexer-sol || true
systemctl is-active pump-indexer 2>/dev/null || echo "pump-indexer=inactive (expected)"
pm2 list 2>/dev/null | grep -E 'alto|Name' || true
journalctl -u pump-indexer-sol -n 15 --no-pager || true
echo "== done =="

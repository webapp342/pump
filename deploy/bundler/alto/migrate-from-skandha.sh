#!/usr/bin/env bash
# Stop Skandha, clear stale mempool, start Alto. Run on VM after git pull.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${REPO:-/var/www/pump/tma}"

pm2 stop pump-skandha 2>/dev/null || true
pm2 delete pump-skandha 2>/dev/null || true
rm -rf /root/.skandha/db 2>/dev/null || true

cd "$REPO"
bash "$ROOT/setup-alto-pm2.sh"
bash "$ROOT/health.sh"

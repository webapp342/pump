#!/usr/bin/env bash
# Pull latest + build web/indexer packages after F3/F4 program + UI changes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "[guncelleme-deploy] git pull"
git pull --ff-only

echo "[guncelleme-deploy] build workspaces"
npm run build -w @pump/solana-sdk
npm run build -w @pump/xp
npm run build -w @pump/web

echo "[guncelleme-deploy] pm2 restart"
pm2 restart pump-tma pump-indexer-sol --update-env

echo "[guncelleme-deploy] OK — verify:"
echo "  curl -s localhost:3012/api/season/status | jq"
echo "  curl -s 'localhost:3012/api/xp/weekly?address=<wallet>' | jq"

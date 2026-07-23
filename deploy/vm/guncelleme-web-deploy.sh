#!/usr/bin/env bash
# F3/F4 hotfix helper — delegates to the real production deploy.
#
# CI/CD (push → main) already runs deploy/tma-deploy.sh via .github/workflows/deploy.yml.
# Use this ONLY when you need a manual VM deploy without waiting for Actions:
#   bash deploy/vm/guncelleme-web-deploy.sh
#
# Do NOT use for day-to-day deploys — prefer: git push origin main
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[guncelleme-deploy] Bu script deploy/tma-deploy.sh çağırır (npm ci + full build + pm2)."
echo "[guncelleme-deploy] Normal akış: main'e push → GitHub Actions otomatik deploy."
echo ""

exec bash "$ROOT/deploy/tma-deploy.sh"

#!/usr/bin/env bash
# PM2 entry — price worker with repo .env loaded.
set -euo pipefail

REPO_ROOT="${PUMP_REPO_ROOT:-/var/www/pump/tma}"
cd "$REPO_ROOT"

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

export PUMP_REPO_ROOT="$REPO_ROOT"

# @pump/xp may be needed before first web build in fresh clones
if [[ ! -d "$REPO_ROOT/packages/pump-xp/dist" ]]; then
  npm run build -w @pump/xp
fi

exec "$REPO_ROOT/node_modules/.bin/tsx" "$REPO_ROOT/scripts/price-worker.ts"

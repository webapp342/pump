#!/bin/bash
# Build static admin console for nginx /admin/ (same-origin /api proxy).
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"

log() {
  echo "[admin-build] $*"
}

cd "$REPO_ROOT"

if [[ -f "$REPO_ROOT/.env" ]]; then
  log "Linking root .env for Vite build (NEXT_PUBLIC_ADMIN_ADDRESS, etc.)"
  ln -sfn "$REPO_ROOT/.env" "$REPO_ROOT/apps/admin/.env"
fi

log "Building admin (@pump/admin, base=/admin/)"
VITE_ADMIN_BASE=/admin/ npm run build -w @pump/admin

if [[ ! -f "$REPO_ROOT/apps/admin/dist/index.html" ]]; then
  log "apps/admin/dist/index.html missing"
  exit 1
fi

log "Admin console built → $REPO_ROOT/apps/admin/dist"

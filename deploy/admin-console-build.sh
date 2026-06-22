#!/bin/bash
# Build static admin console for nginx /admin/ (same-origin /api proxy).
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"

log() {
  echo "[admin-build] $*"
}

cd "$REPO_ROOT"

log "Building admin (@pump/admin, base=/admin/)"
VITE_ADMIN_BASE=/admin/ npm run build -w @pump/admin

if [[ ! -f "$REPO_ROOT/apps/admin/dist/index.html" ]]; then
  log "apps/admin/dist/index.html missing"
  exit 1
fi

log "Admin console built → $REPO_ROOT/apps/admin/dist"

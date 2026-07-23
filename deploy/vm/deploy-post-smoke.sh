#!/usr/bin/env bash
# Post-deploy smoke checks (non-fatal warnings for optional services).
set -euo pipefail

REPO_ROOT="${1:-/var/www/pump/tma}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
REALTIME_URL="${REALTIME_HEALTH_URL:-http://127.0.0.1:3013}"

log() { echo "[post-deploy] $*"; }
warn() { echo "[post-deploy] WARN: $*" >&2; }

cd "$REPO_ROOT"

if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  log "web health OK"
else
  warn "web health failed ($HEALTH_URL)"
fi

if curl -sf "$REALTIME_URL" >/dev/null 2>&1; then
  log "realtime OK"
else
  warn "realtime health failed ($REALTIME_URL)"
fi

if systemctl is-active pump-indexer-sol-go >/dev/null 2>&1; then
  log "pump-indexer-sol-go active"
elif systemctl is-active pump-indexer-sol >/dev/null 2>&1; then
  log "pump-indexer-sol active (legacy TS)"
else
  warn "no active Solana indexer service"
fi

if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli ping 2>/dev/null | grep -qi PONG; then
    log "redis OK"
  fi
fi

log "smoke complete sha=${DEPLOY_SHA:-unknown}"

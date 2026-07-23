#!/usr/bin/env bash
# Post-deploy smoke checks (non-fatal warnings for optional services).
set -euo pipefail

REPO_ROOT="${1:-/var/www/pump/tma}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
REALTIME_URL="${REALTIME_HEALTH_URL:-http://127.0.0.1:3013}"
TARGETS="${DEPLOY_TARGETS:-}"
RECONCILE_RAN="${DEPLOY_RECONCILE_RAN:-}"

log() { echo "[post-deploy] $*"; }
warn() { echo "[post-deploy] WARN: $*" >&2; }

has_target() {
  local t="$1"
  [[ -z "$TARGETS" || ",${TARGETS}," == *",${t},"* ]]
}

should_check() {
  local t="$1"
  has_target "$t" || [[ "$RECONCILE_RAN" == "1" ]] || [[ "$TARGETS" == "sync" ]]
}

cd "$REPO_ROOT"

if should_check web; then
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    log "web health OK"
  else
    warn "web health failed ($HEALTH_URL)"
  fi
fi

if should_check realtime; then
  if curl -sf "$REALTIME_URL" >/dev/null 2>&1; then
    log "realtime OK"
  else
    warn "realtime health failed ($REALTIME_URL)"
  fi
fi

if should_check indexer_go || [[ -d "$REPO_ROOT/apps/indexer-sol-go/cmd/indexer" ]]; then
  if systemctl is-active pump-indexer-sol-go >/dev/null 2>&1; then
    log "pump-indexer-sol-go active"
  elif systemctl is-active pump-indexer-sol >/dev/null 2>&1; then
    log "pump-indexer-sol active (legacy TS)"
  else
    warn "no active Solana indexer service"
  fi
fi

if should_check web || should_check realtime || should_check indexer_go; then
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli ping 2>/dev/null | grep -qi PONG; then
      log "redis OK"
    fi
  fi
fi

log "smoke complete sha=${DEPLOY_SHA:-unknown}"

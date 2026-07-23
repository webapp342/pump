#!/usr/bin/env bash
# Heal production services that should be running but are down/unhealthy.
# No full rebuild — start/restart PM2 + Go indexer deploy when needed.
# Runs on every deploy (especially sync_only) after git sync.
set -uo pipefail

REPO_ROOT="${1:-/var/www/pump/tma}"
ECOSYSTEM="$REPO_ROOT/ecosystem.config.cjs"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
REALTIME_URL="${REALTIME_HEALTH_URL:-http://127.0.0.1:3013}"
INDEXER_SERVICE="${INDEXER_SOL_GO_SERVICE:-pump-indexer-sol-go}"

log() { echo "[reconcile] $*"; }
warn() { echo "[reconcile] WARN: $*" >&2; }

PM2_APPS=(pump-tma pump-realtime pump-ch-flusher pump-price-worker)
failures=0

pm2_status() {
  local app="$1"
  pm2 jlist 2>/dev/null | node -e "
    const fs = require('fs');
    const name = process.argv[1];
    const apps = JSON.parse(fs.readFileSync(0, 'utf8') || '[]');
    const hit = apps.find((a) => a.name === name);
    if (!hit) { process.stdout.write('missing'); process.exit(0); }
    process.stdout.write(String(hit.pm2_env?.status ?? 'unknown'));
  " "$app" 2>/dev/null || echo "unknown"
}

pm2_restart_one() {
  local app="$1"
  log "pm2 restart $app"
  pm2 startOrRestart "$ECOSYSTEM" --only "$app" --update-env
}

curl_ok() {
  curl -sf --connect-timeout 2 --max-time 5 "$1" >/dev/null 2>&1
}

cd "$REPO_ROOT"

if [[ ! -f "$ECOSYSTEM" ]]; then
  warn "ecosystem.config.cjs missing — skip pm2 reconcile"
else
  local_needs=()
  for app in "${PM2_APPS[@]}"; do
    st="$(pm2_status "$app")"
    case "$st" in
      online)
        log "pm2 $app OK ($st)"
        ;;
      missing|stopped|errored|waiting|launching|unknown)
        warn "pm2 $app unhealthy ($st) — will restart"
        local_needs+=("$app")
        ;;
      *)
        warn "pm2 $app status=$st — will restart"
        local_needs+=("$app")
        ;;
    esac
  done

  if [[ ${#local_needs[@]} -gt 0 ]]; then
    only="$(IFS=,; echo "${local_needs[*]}")"
    log "pm2 startOrRestart --only $only"
    pm2 startOrRestart "$ECOSYSTEM" --only "$only" --update-env || failures=$((failures + 1))
    sleep 3
  fi
fi

# HTTP health — restart PM2 if process online but not responding
if ! curl_ok "$HEALTH_URL"; then
  warn "web health failed ($HEALTH_URL)"
  if [[ -f "$ECOSYSTEM" ]]; then
    pm2_restart_one "pump-tma"
    sleep 4
    curl_ok "$HEALTH_URL" && log "web health recovered" || { warn "web still unhealthy after restart"; failures=$((failures + 1)); }
  fi
else
  log "web health OK"
fi

if ! curl_ok "$REALTIME_URL"; then
  warn "realtime health failed ($REALTIME_URL)"
  if [[ -f "$ECOSYSTEM" ]]; then
    pm2_restart_one "pump-realtime"
    sleep 3
    curl_ok "$REALTIME_URL" && log "realtime recovered" || { warn "realtime still unhealthy"; failures=$((failures + 1)); }
  fi
else
  log "realtime health OK"
fi

# Go Solana indexer (systemd)
if [[ -d "$REPO_ROOT/apps/indexer-sol-go/cmd/indexer" ]]; then
  idx_st="$(systemctl is-active "$INDEXER_SERVICE" 2>/dev/null || echo inactive)"
  idx_failed=0
  if systemctl is-failed "$INDEXER_SERVICE" &>/dev/null; then
    idx_failed=1
  fi

  binary="$REPO_ROOT/apps/indexer-sol-go/bin/indexer-sol-go"
  if [[ "$idx_st" != "active" ]] || [[ "$idx_failed" -eq 1 ]] || [[ ! -x "$binary" ]]; then
    warn "indexer $INDEXER_SERVICE status=$idx_st failed=$idx_failed binary=$([[ -x "$binary" ]] && echo ok || echo missing)"
    # shellcheck source=deploy/vm/ensure-go-path.sh
    source "$REPO_ROOT/deploy/vm/ensure-go-path.sh"
    ensure_go_path || true
    if bash "$REPO_ROOT/deploy/vm/indexer-sol-go-deploy.sh"; then
      log "indexer deploy/restart OK"
    else
      warn "indexer deploy failed — check Go PATH and apps/indexer-sol-go/.env"
      failures=$((failures + 1))
    fi
  else
    log "indexer $INDEXER_SERVICE active"
  fi
fi

# Redis (warn only)
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli ping 2>/dev/null | grep -qi PONG; then
    log "redis OK"
  else
    warn "redis not responding — manual check required"
  fi
fi

log "reconcile complete"
exit "$failures"

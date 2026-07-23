#!/usr/bin/env bash
# Pre-flight checks before build/deploy — fail fast with clear errors.
# Usage: bash deploy/vm/deploy-preflight.sh [/var/www/pump/tma] [full|ui]
set -euo pipefail

REPO_ROOT="${1:-/var/www/pump/tma}"
MODE="${2:-full}"
PG_DB="${PGDATABASE:-pump_db}"

log() { echo "[preflight] $*"; }
warn() { echo "[preflight] WARN: $*" >&2; }
fail() { echo "[preflight] ERROR: $*" >&2; exit 1; }

cd "$REPO_ROOT"

export DEPLOY_SHA="${DEPLOY_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
export DEPLOY_REF="${DEPLOY_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}"
log "commit=${DEPLOY_SHA} ref=${DEPLOY_REF} mode=${MODE}"

# --- required paths ---
[[ -f "$REPO_ROOT/package-lock.json" ]] || fail "missing package-lock.json"
[[ -f "$REPO_ROOT/apps/web/package.json" ]] || fail "missing apps/web"
[[ -f "$REPO_ROOT/.env" ]] || warn "root .env missing — Next.js build may lack NEXT_PUBLIC_*"

# --- postgres ---
if sudo -u postgres psql -d "$PG_DB" -c "SELECT 1" >/dev/null 2>&1; then
  log "postgres OK ($PG_DB)"
else
  fail "postgres unreachable (database $PG_DB)"
fi

# --- redis (warn only — web can start without) ---
if [[ -f "$REPO_ROOT/.env" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$REPO_ROOT/.env" 2>/dev/null || true
  set +a
fi
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
if command -v redis-cli >/dev/null 2>&1; then
  hostport="${REDIS_URL#redis://}"
  hostport="${hostport%%/*}"
  host="${hostport%%:*}"
  port="${hostport##*:}"
  [[ "$host" == "$port" ]] && port=6379
  if redis-cli -h "$host" -p "$port" ping 2>/dev/null | grep -qi PONG; then
    log "redis OK"
  else
    warn "redis ping failed ($REDIS_URL) — realtime/XP may lag until redis is up"
  fi
else
  warn "redis-cli not installed — skip redis probe"
fi

# --- disk (need ≥2GB free on root) ---
if command -v df >/dev/null 2>&1; then
  free_kb="$(df -Pk "$REPO_ROOT" | awk 'NR==2 {print $4}')"
  if [[ "${free_kb:-0}" -lt 2097152 ]]; then
    warn "low disk (<2GB free on $(df -Pk "$REPO_ROOT" | awk 'NR==2 {print $1}')) — build may fail"
  else
    log "disk OK"
  fi
fi

# --- node (skip for migrate-only / indexer-only) ---
if [[ "$MODE" != "migrate" && "$MODE" != "indexer" ]]; then
  if ! command -v node >/dev/null 2>&1; then
    fail "node not installed"
  fi
  log "node $(node -v)"
fi

# --- indexer / full: Go indexer ---
if [[ "$MODE" == "full" || "$MODE" == "indexer" ]]; then
  if [[ -f "$REPO_ROOT/deploy/vm/indexer-sol-go-deploy.sh" ]]; then
    # shellcheck source=deploy/vm/ensure-go-path.sh
    source "$REPO_ROOT/deploy/vm/ensure-go-path.sh"
    ensure_go_path || true
    if command -v go >/dev/null 2>&1; then
      go version | grep -qE 'go1\.(2[5-9]|[3-9][0-9])' && log "go OK" || warn "Go 1.25.1+ recommended for indexer-sol-go (LaserStream SDK)"
    else
      warn "Go not installed — indexer slice will skip; install Go 1.25.1+ on VM"
    fi
    if [[ ! -f "$REPO_ROOT/apps/indexer-sol-go/.env" ]]; then
      warn "apps/indexer-sol-go/.env missing — indexer deploy will merge from indexer-sol/.env or .env.example"
    fi
  fi
fi

log "preflight passed"

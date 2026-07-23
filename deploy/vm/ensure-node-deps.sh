#!/usr/bin/env bash
# Fast dependency probe — npm ci/install only when lock changed or packages missing.
# Usage: bash deploy/vm/ensure-node-deps.sh [/var/www/pump/tma]
set -euo pipefail

REPO_ROOT="${1:-/var/www/pump/tma}"
cd "$REPO_ROOT"

LOCK_FILE="$REPO_ROOT/package-lock.json"
STAMP_DIR="$REPO_ROOT/.deploy"
STAMP_FILE="$STAMP_DIR/node-deps.stamp"

log() { echo "[ensure-deps] $*"; }

if [[ ! -f "$LOCK_FILE" ]]; then
  log "ERROR: missing $LOCK_FILE"
  exit 1
fi

mkdir -p "$STAMP_DIR"
LOCK_HASH="$(sha256sum "$LOCK_FILE" | awk '{print $1}')"

# Build-critical workspaces (tma-deploy + ui-deploy)
REQUIRED=(
  next
  typescript
  "@pump/web"
  "@pump/admin"
  "@pump/solana-sdk"
  "@pump/xp"
  "@pump/realtime"
  "@pump/ch-flusher"
)

missing=()

probe_tree() {
  missing=()
  if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
    missing+=("node_modules/")
    return 0
  fi
  local pkg
  for pkg in "${REQUIRED[@]}"; do
    if ! node -e "require.resolve('${pkg}/package.json')" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done
}

# --- phase 1: cached OK (no node, ~instant) ---
if [[ -f "$STAMP_FILE" ]]; then
  read -r saved_hash saved_status _ < "$STAMP_FILE" || true
  if [[ "$saved_hash" == "$LOCK_HASH" && "$saved_status" == "ok" && -d "$REPO_ROOT/node_modules" ]]; then
    log "cache hit (lock + prior probe OK) — skip install"
    exit 0
  fi
fi

# --- phase 2: fast probe (~1–2s) ---
log "probing node_modules…"
probe_tree

if [[ ${#missing[@]} -eq 0 ]]; then
  log "all required packages present — skip install"
  printf '%s ok %s\n' "$LOCK_HASH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAMP_FILE"
  exit 0
fi

# --- phase 3: install only what's needed ---
SAVED_LOCK=""
if [[ -f "$STAMP_FILE" ]]; then
  read -r SAVED_LOCK _ _ < "$STAMP_FILE" || true
fi

MISSING_LIST="${missing[*]}"
if [[ "$LOCK_HASH" != "$SAVED_LOCK" ]] || [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  log "npm ci (lock changed or empty tree) — missing: ${MISSING_LIST:-none}"
  npm ci --prefer-offline --no-audit --no-fund
else
  log "npm install incremental (lock same, gaps only) — missing: $MISSING_LIST"
  npm install --prefer-offline --no-audit --no-fund
fi

# --- phase 4: verify ---
probe_tree
if [[ ${#missing[@]} -gt 0 ]]; then
  log "ERROR: still missing after install: ${missing[*]}"
  exit 1
fi

log "deps ready"
printf '%s ok %s\n' "$LOCK_HASH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAMP_FILE"

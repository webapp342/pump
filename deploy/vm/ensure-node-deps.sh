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

# npm registry packages — require.resolve works
REGISTRY_REQUIRED=(next typescript)

# Monorepo workspaces — check source tree (ESM "exports" blocks require.resolve on package.json)
WORKSPACE_REQUIRED=(
  "@pump/web"
  "@pump/admin"
  "@pump/solana-sdk"
  "@pump/xp"
  "@pump/realtime"
  "@pump/ch-flusher"
)

missing=()

workspace_manifest() {
  case "$1" in
    "@pump/web")        echo "apps/web/package.json" ;;
    "@pump/admin")      echo "apps/admin/package.json" ;;
    "@pump/solana-sdk") echo "packages/solana-sdk/package.json" ;;
    "@pump/xp")         echo "packages/pump-xp/package.json" ;;
    "@pump/realtime")   echo "apps/realtime/package.json" ;;
    "@pump/ch-flusher") echo "apps/ch-flusher/package.json" ;;
    *)                  return 1 ;;
  esac
}

pkg_present() {
  local pkg="$1"
  local rel
  if rel="$(workspace_manifest "$pkg" 2>/dev/null)"; then
    [[ -f "$REPO_ROOT/$rel" ]] && return 0
    [[ -f "$REPO_ROOT/node_modules/$pkg/package.json" ]] && return 0
    return 1
  fi
  node -e "require.resolve('${pkg}/package.json')" >/dev/null 2>&1
}

probe_tree() {
  missing=()
  if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
    missing+=("node_modules/")
    return 0
  fi
  local pkg
  for pkg in "${REGISTRY_REQUIRED[@]}" "${WORKSPACE_REQUIRED[@]}"; do
    if ! pkg_present "$pkg"; then
      missing+=("$pkg")
    fi
  done
}

build_workspace_packages() {
  # web prebuild runs these too; ensure dist exists before Next build after fresh ci
  local built=0
  if [[ ! -f "$REPO_ROOT/packages/solana-sdk/dist/index.js" ]]; then
    log "building @pump/solana-sdk (dist missing)"
    npm run build -w @pump/solana-sdk --if-present
    built=1
  fi
  if [[ ! -f "$REPO_ROOT/packages/pump-xp/dist/index.js" ]]; then
    log "building @pump/xp (dist missing)"
    npm run build -w @pump/xp --if-present
    built=1
  fi
  if [[ "$built" -eq 1 ]]; then
    log "workspace packages built"
  fi
}

# --- phase 1: cached OK (no node, ~instant) ---
if [[ -f "$STAMP_FILE" ]]; then
  read -r saved_hash saved_status _ < "$STAMP_FILE" || true
  if [[ "$saved_hash" == "$LOCK_HASH" && "$saved_status" == "ok" && -d "$REPO_ROOT/node_modules" ]]; then
    build_workspace_packages
    log "cache hit (lock unchanged, deps verified) — skipped npm ci/install"
    exit 0
  fi
fi

# --- phase 2: fast probe (~1–2s) ---
log "probing node_modules…"
probe_tree

if [[ ${#missing[@]} -eq 0 ]]; then
  build_workspace_packages
  log "all required packages present — skipped npm ci/install"
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

build_workspace_packages

# --- phase 4: verify ---
probe_tree
if [[ ${#missing[@]} -gt 0 ]]; then
  log "ERROR: still missing after install: ${missing[*]}"
  exit 1
fi

log "deps ready"
printf '%s ok %s\n' "$LOCK_HASH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAMP_FILE"

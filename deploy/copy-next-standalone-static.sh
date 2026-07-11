#!/bin/bash
# Copy Next.js build output into the standalone PM2 cwd (atomic swap).
# Usage: copy-next-standalone-static.sh <apps/web dir> <standalone apps/web dir>
set -euo pipefail

WEB_DIR="${1:?apps/web path required}"
STANDALONE_APP_DIR="${2:?standalone apps/web path required}"

log() {
  echo "[copy-next-static] $*"
}

if [[ ! -d "$WEB_DIR/.next/static" ]]; then
  log "ERROR: missing $WEB_DIR/.next/static — run npm run build -w @pump/web first"
  exit 1
fi

if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
  log "ERROR: missing $STANDALONE_APP_DIR/server.js"
  exit 1
fi

mkdir -p "$STANDALONE_APP_DIR/.next"

STATIC_TMP="$STANDALONE_APP_DIR/.next/static.__deploy_tmp"
rm -rf "$STATIC_TMP"
cp -a "$WEB_DIR/.next/static" "$STATIC_TMP"

if [[ ! -d "$STATIC_TMP/chunks" ]] || [[ -z "$(find "$STATIC_TMP/chunks" -maxdepth 1 -type f | head -1)" ]]; then
  log "ERROR: copied static tree has no chunk files"
  exit 1
fi

rm -rf "$STANDALONE_APP_DIR/.next/static"
mv "$STATIC_TMP" "$STANDALONE_APP_DIR/.next/static"

if [[ -f "$WEB_DIR/.next/BUILD_ID" ]]; then
  cp "$WEB_DIR/.next/BUILD_ID" "$STANDALONE_APP_DIR/.next/BUILD_ID"
fi

CHUNK_COUNT="$(find "$STANDALONE_APP_DIR/.next/static/chunks" -type f | wc -l | tr -d ' ')"
BUILD_ID="$(cat "$STANDALONE_APP_DIR/.next/BUILD_ID" 2>/dev/null || echo unknown)"
log "OK — BUILD_ID=$BUILD_ID chunks=$CHUNK_COUNT → $STANDALONE_APP_DIR/.next/static"

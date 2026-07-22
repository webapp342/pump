#!/usr/bin/env bash
# PM2 entry — build ch-flusher if dist missing, then run.
set -euo pipefail

REPO_ROOT="${PUMP_REPO_ROOT:-/var/www/pump/tma}"
cd "$REPO_ROOT"

DIST="$REPO_ROOT/apps/ch-flusher/dist/flusher.js"
if [[ ! -f "$DIST" ]]; then
  echo "[start-ch-flusher] dist missing — building @pump/ch-flusher"
  npm run build -w @pump/ch-flusher
fi

if [[ ! -f "$DIST" ]]; then
  echo "[start-ch-flusher] FATAL: $DIST not found after build" >&2
  exit 1
fi

exec node "$DIST"

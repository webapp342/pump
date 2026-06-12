#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pump/tma}"
PM2_APP="${PM2_APP:-pump-tma}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"

log() {
  echo "[tma-deploy] $*"
}

cd "$APP_DIR"

log "Syncing repo to origin/main (discards local changes to tracked files)"
git fetch origin main
git reset --hard origin/main
git clean -fd

log "Installing dependencies"
npm ci

log "Building Next.js"
npm run build

log "Copying static assets into standalone output"
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
if [ -d public ]; then
  cp -r public .next/standalone/public
fi

log "Restarting PM2 app: $PM2_APP"
pm2 restart "$PM2_APP" --update-env

log "Health check: $HEALTH_URL"
health_ok=0
for attempt in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    health_ok=1
    break
  fi
  log "Waiting for app to become ready (${attempt}/30)..."
  sleep 2
done

if [ "$health_ok" -ne 1 ]; then
  log "Health check failed after 60s"
  pm2 logs "$PM2_APP" --lines 30 --nostream || true
  exit 1
fi

log "Deploy finished successfully"

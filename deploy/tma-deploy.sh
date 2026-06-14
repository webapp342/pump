#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pump/tma}"
PM2_APP="${PM2_APP:-pump-tma}"
REALTIME_PM2_APP="${REALTIME_PM2_APP:-pump-realtime}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
REALTIME_HEALTH_URL="${REALTIME_HEALTH_URL:-http://127.0.0.1:3013}"

log() {
  echo "[tma-deploy] $*"
}

cd "$APP_DIR"

chmod +x deploy/vm/system-health.sh 2>/dev/null || true

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

# git clean -fd above removes untracked realtime/dist/ — rebuild every deploy so reboot/PM2 resurrect works.
log "Building pump-realtime"
(
  cd "$APP_DIR/realtime"
  npm ci
  npm run build
)
if [ ! -f "$APP_DIR/realtime/dist/server.js" ]; then
  log "pump-realtime build did not produce dist/server.js"
  exit 1
fi

log "Restarting PM2 apps: $PM2_APP, $REALTIME_PM2_APP"
pm2 restart "$PM2_APP" --update-env
if pm2 describe "$REALTIME_PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$REALTIME_PM2_APP" --update-env
else
  log "$REALTIME_PM2_APP not registered in PM2; starting from ecosystem.config.cjs"
  pm2 start ecosystem.config.cjs --only "$REALTIME_PM2_APP"
fi

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
  log "Health check failed after 60s: $PM2_APP"
  pm2 logs "$PM2_APP" --lines 30 --nostream || true
  exit 1
fi

log "Health check: $REALTIME_HEALTH_URL"
realtime_ok=0
for attempt in $(seq 1 30); do
  if curl -sf "$REALTIME_HEALTH_URL" >/dev/null; then
    realtime_ok=1
    break
  fi
  log "Waiting for pump-realtime to become ready (${attempt}/30)..."
  sleep 2
done

if [ "$realtime_ok" -ne 1 ]; then
  log "Health check failed after 60s: $REALTIME_PM2_APP"
  pm2 logs "$REALTIME_PM2_APP" --lines 30 --nostream || true
  exit 1
fi

log "Deploy finished successfully"

# Referral system (BondingCurveManager redeploy) — run separately BEFORE app deploy:
# See deploy/REFERRAL_SYSTEM_DEPLOY.md
# 1. forge script script/DeployBondingCurveReferral.s.sol --broadcast
# 2. Update bsc-testnet-pump.json + contract_registry + INDEXER_START_BLOCK
# 3. Apply db/migrations/005_referral_system.sql
# 4. Update NEXT_PUBLIC_BONDING_CURVE_MANAGER in .env → tma-deploy.sh
# Existing tokens stay on the old bonding contract until migrated / testnet reset.

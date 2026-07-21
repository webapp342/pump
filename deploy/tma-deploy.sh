#!/bin/bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"
WEB_DIR="$REPO_ROOT/apps/web"
ADMIN_DIR="$REPO_ROOT/apps/admin"
REALTIME_DIR="$REPO_ROOT/apps/realtime"
PM2_APP="${PM2_APP:-pump-tma}"
REALTIME_PM2_APP="${REALTIME_PM2_APP:-pump-realtime}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3012/api/health}"
REALTIME_HEALTH_URL="${REALTIME_HEALTH_URL:-http://127.0.0.1:3013}"

log() {
  echo "[tma-deploy] $*"
}

cd "$REPO_ROOT"

GIT_REF="${GIT_REF:-main}"

chmod +x deploy/vm/system-health.sh 2>/dev/null || true

log "Syncing repo to origin/${GIT_REF}"
git fetch origin "$GIT_REF"
git reset --hard "origin/${GIT_REF}"
git clean -fd

ENV_FILE="$REPO_ROOT/.env"

# Production = Solana (push → CI/CD sets env before build)
if [[ -f "$REPO_ROOT/deploy/vm/ensure-solana-env.sh" ]]; then
  chmod +x "$REPO_ROOT/deploy/vm/ensure-solana-env.sh"
  # shellcheck source=/dev/null
  source "$REPO_ROOT/deploy/vm/ensure-solana-env.sh" "$ENV_FILE"
fi

log "Installing workspace dependencies"
npm ci

if [[ -f "$ENV_FILE" ]]; then
  log "Linking root .env for Next.js build (NEXT_PUBLIC_* inlined at build time)"
  ln -sfn "$ENV_FILE" "$WEB_DIR/.env"
fi

# solana_wallets table (custodial Ed25519 keys)
MIG_044="$REPO_ROOT/db/migrations/044_solana_wallets.sql"
if [[ -f "$MIG_044" ]]; then
  log "Applying migration 044_solana_wallets.sql (idempotent)"
  if sudo -u postgres psql -d pump_db -v ON_ERROR_STOP=1 -f "$MIG_044"; then
    log "Migration 044 OK"
  else
    log "WARN: migration 044 failed — check postgres permissions"
  fi
fi

MIG_045="$REPO_ROOT/db/migrations/045_solana_address_checks.sql"
if [[ -f "$MIG_045" ]]; then
  log "Applying migration 045_solana_address_checks.sql (idempotent)"
  if sudo -u postgres psql -d pump_db -v ON_ERROR_STOP=1 -f "$MIG_045"; then
    log "Migration 045 OK"
  else
    log "WARN: migration 045 failed — check postgres permissions"
  fi
fi

MIG_046="$REPO_ROOT/db/migrations/046_solana_user_address_checks.sql"
if [[ -f "$MIG_046" ]]; then
  log "Applying migration 046_solana_user_address_checks.sql (idempotent)"
  if sudo -u postgres psql -d pump_db -v ON_ERROR_STOP=1 -f "$MIG_046"; then
    log "Migration 046 OK"
  else
    log "WARN: migration 046 failed — check postgres permissions"
  fi
fi

MIG_047="$REPO_ROOT/db/migrations/047_solana_remaining_address_checks.sql"
if [[ -f "$MIG_047" ]]; then
  log "Applying migration 047_solana_remaining_address_checks.sql (idempotent)"
  if sudo -u postgres psql -d pump_db -v ON_ERROR_STOP=1 -f "$MIG_047"; then
    log "Migration 047 OK"
  else
    log "WARN: migration 047 failed — check postgres permissions"
  fi
fi

# Solana points / referral claim (base58 case) — required for Referral Invites XP claim
# + comprehensive admin wipe (XP / perks / airdrop leaderboards; keeps launchpad_tasks)
for mig in \
  049_launchpad_wallet_address_normalize.sql \
  050_repair_solana_points_inventory_address.sql \
  051_claim_referral_invite_xp_solana.sql \
  052_wipe_launchpad_app_data_comprehensive.sql
do
  MIG_PATH="$REPO_ROOT/db/migrations/$mig"
  if [[ -f "$MIG_PATH" ]]; then
    log "Applying migration $mig (idempotent)"
    if sudo -u postgres psql -d pump_db -v ON_ERROR_STOP=1 -f "$MIG_PATH"; then
      log "Migration $mig OK"
    else
      log "WARN: migration $mig failed — check postgres permissions"
    fi
  fi
done

log "Building Next.js (@pump/web)"
npm run build -w @pump/web

if [[ -f "$REPO_ROOT/deploy/admin-console-build.sh" ]]; then
  log "Building admin console"
  chmod +x "$REPO_ROOT/deploy/admin-console-build.sh"
  bash "$REPO_ROOT/deploy/admin-console-build.sh"
else
  log "WARN: deploy/admin-console-build.sh missing — skip admin build"
fi

STANDALONE_APP_DIR="$WEB_DIR/.next/standalone/apps/web"
if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
  STANDALONE_APP_DIR="$WEB_DIR/.next/standalone"
fi
if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
  log "standalone server.js missing under apps/web/.next/standalone"
  exit 1
fi

log "Copying static assets into standalone output ($STANDALONE_APP_DIR)"
mkdir -p "$STANDALONE_APP_DIR/.next"
cp -r "$WEB_DIR/.next/static" "$STANDALONE_APP_DIR/.next/static"
if [ -d "$WEB_DIR/public" ]; then
  cp -r "$WEB_DIR/public" "$STANDALONE_APP_DIR/public"
fi

log "Building pump-realtime"
npm run build -w @pump/realtime
if [ ! -f "$REALTIME_DIR/dist/server.js" ]; then
  log "pump-realtime build did not produce dist/server.js"
  exit 1
fi

log "Reloading PM2 from ecosystem.config.cjs (applies cwd/script paths)"
pm2 startOrRestart "$REPO_ROOT/ecosystem.config.cjs" --update-env

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

if [[ "${SKIP_INDEXER_DEPLOY:-}" != "1" ]] && [[ -f "$REPO_ROOT/deploy/vm/indexer-sol-deploy.sh" ]]; then
  log "Deploying Solana indexer (sync + rebuild + restart)"
  chmod +x "$REPO_ROOT/deploy/vm/indexer-sol-deploy.sh"
  bash "$REPO_ROOT/deploy/vm/indexer-sol-deploy.sh" || {
    log "WARN: indexer-sol deploy failed — one-time on VM:"
    log "  cp deploy/pump-indexer-sol.service /etc/systemd/system/"
    log "  systemctl daemon-reload && systemctl enable --now pump-indexer-sol"
    log "  Ensure apps/indexer-sol/.env exists (see apps/indexer-sol/.env.example)"
  }
elif [[ "${SKIP_EVM_INDEXER:-}" != "1" ]] && [[ "${SKIP_INDEXER_DEPLOY:-}" != "1" ]] && [[ -f "$REPO_ROOT/deploy/vm/indexer-deploy.sh" ]]; then
  log "Deploying EVM indexer"
  chmod +x "$REPO_ROOT/deploy/vm/indexer-deploy.sh"
  bash "$REPO_ROOT/deploy/vm/indexer-deploy.sh" || {
    log "Indexer deploy failed — fix artifacts/.env/RPC and re-run: deploy/vm/indexer-deploy.sh"
  }
else
  log "Skipping indexer deploy"
fi

log "Deploy finished successfully"
log "Admin UI: http://<host>/admin/  (nginx location /admin/ — run nginx -t && reload if config changed)"

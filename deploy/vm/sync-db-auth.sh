#!/usr/bin/env bash
# Sync pump_app / pump_indexer passwords: PostgreSQL → PgBouncer userlist → .env files
set -euo pipefail

REPO="${REPO:-/var/www/pump/tma}"
SECRETS="${SECRETS:-/root/pump-bootstrap-secrets.txt}"
ENV_FILE="${ENV_FILE:-$REPO/deploy/vm/bootstrap.env}"
TMA_ENV="${TMA_ENV:-$REPO/.env}"
INDEXER_ENV="${INDEXER_ENV:-/var/www/pump/Indexer/.env}"

log() { echo "[sync-db-auth] $*"; }
die() { echo "[sync-db-auth] ERROR: $*" >&2; exit 1; }

read_secret() {
  local key="$1"
  if [[ -f "$SECRETS" ]] && grep -q "^${key}=" "$SECRETS"; then
    grep "^${key}=" "$SECRETS" | head -1 | cut -d= -f2-
    return 0
  fi
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    local val
    val="$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
    if [[ -n "$val" ]]; then
      echo "$val"
      return 0
    fi
  fi
  return 1
}

APP_PW="$(read_secret PUMP_APP_DB_PASSWORD)" || die "Set PUMP_APP_DB_PASSWORD in $SECRETS or $ENV_FILE"
IDX_PW="$(read_secret PUMP_INDEXER_DB_PASSWORD)" || die "Set PUMP_INDEXER_DB_PASSWORD in $SECRETS or $ENV_FILE"

db_port="6432"
if ! command -v pgbouncer >/dev/null 2>&1 || ! ss -tlnH 2>/dev/null | grep -q ':6432 '; then
  db_port="5432"
fi

log "PostgreSQL: ALTER USER pump_app + pump_indexer"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER pump_app WITH PASSWORD '${APP_PW}';"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER pump_indexer WITH PASSWORD '${IDX_PW}';"

patch_env() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  # Dev example port → production PgBouncer
  sed -i 's|127.0.0.1:15432|127.0.0.1:'"${db_port}"'|g' "$file"
  sed -i "s|postgres://pump_app:[^@]*@127.0.0.1:${db_port}/pump_db|postgres://pump_app:${APP_PW}@127.0.0.1:${db_port}/pump_db|g" "$file"
  sed -i "s|postgres://pump_indexer:[^@]*@127.0.0.1:${db_port}/pump_db|postgres://pump_indexer:${IDX_PW}@127.0.0.1:${db_port}/pump_db|g" "$file"
  sed -i "s|postgres://pump_app:[^@]*@127.0.0.1:5432/pump_db|postgres://pump_app:${APP_PW}@127.0.0.1:5432/pump_db|g" "$file"
  sed -i "s|postgres://pump_indexer:[^@]*@127.0.0.1:5432/pump_db|postgres://pump_indexer:${IDX_PW}@127.0.0.1:5432/pump_db|g" "$file"
  log "  patched $file"
}

patch_env "$TMA_ENV"
patch_env "$INDEXER_ENV"

if command -v pgbouncer >/dev/null 2>&1; then
  log "PgBouncer userlist sync"
  bash "$REPO/deploy/vm/phase-5-pgbouncer.sh"
fi

log "Test pump_app + pump_indexer via port $db_port"
psql "postgres://pump_app:${APP_PW}@127.0.0.1:${db_port}/pump_db" -c 'SELECT 1 AS ok;'
psql "postgres://pump_indexer:${IDX_PW}@127.0.0.1:${db_port}/pump_db" -c 'SELECT 1 AS ok;'

log "Restart app + indexer"
cd "$REPO"
pm2 startOrRestart ecosystem.config.cjs --update-env || true
systemctl restart pump-indexer pump-airdrop-keeper

log "Done — check: journalctl -u pump-indexer -n 15 | grep ready"

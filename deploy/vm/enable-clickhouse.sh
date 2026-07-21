#!/usr/bin/env bash
# Enable self-hosted ClickHouse + indexer dual-write + Redis publish (Solana realtime).
# Run on VM: bash /var/www/pump/tma/deploy/vm/enable-clickhouse.sh
# If Docker is missing, installs Docker CE from the official apt repo (INSTALL_DOCKER=1).
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
COMPOSE_FILE="${TMA_DIR}/deploy/clickhouse/docker-compose.yml"
SCHEMA_FILE="${TMA_DIR}/deploy/clickhouse/init/01_schema.sql"
INDEXER_ENV="${TMA_DIR}/apps/indexer-sol/.env"
WEB_ENV="${TMA_DIR}/.env"
INSTALL_DOCKER="${INSTALL_DOCKER:-1}"

log() { echo "[enable-clickhouse] $*"; }

install_docker_ce() {
  log "Docker missing — installing Docker CE + compose plugin (official apt repo)…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  local codename
  # shellcheck disable=SC1091
  . /etc/os-release
  codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-jammy}}"
  tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${codename}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
}

if [[ ! -f "$COMPOSE_FILE" ]]; then
  log "ERROR: missing $COMPOSE_FILE — pull latest tma code first"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  if [[ "$INSTALL_DOCKER" == "1" ]]; then
    install_docker_ce
  else
    log "ERROR: docker not installed. Run with INSTALL_DOCKER=1"
    exit 1
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  log "Installing docker-compose-plugin…"
  apt-get update -qq
  apt-get install -y -qq docker-compose-plugin
fi

log "Starting ClickHouse (mem_limit 2g)…"
cd "$TMA_DIR"
docker compose -f "$COMPOSE_FILE" up -d

log "Waiting for HTTP ping…"
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:8123/ping" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    log "ERROR: ClickHouse did not become ready"
    docker compose -f "$COMPOSE_FILE" logs --tail 40
    exit 1
  fi
done

log "Applying schema…"
docker exec -i pump-clickhouse clickhouse-client --multiquery < "$SCHEMA_FILE"
if [[ -f "${TMA_DIR}/deploy/clickhouse/init/02_candles_spot.sql" ]]; then
  log "Applying candles_spot authoritative schema…"
  docker exec -i pump-clickhouse clickhouse-client --multiquery < "${TMA_DIR}/deploy/clickhouse/init/02_candles_spot.sql"
fi
SCHEMA_SPOT="${TMA_DIR}/deploy/clickhouse/init/02_candles_spot.sql"
if [[ -f "$SCHEMA_SPOT" ]]; then
  log "Applying candles_spot schema…"
  docker exec -i pump-clickhouse clickhouse-client --multiquery < "$SCHEMA_SPOT"
fi

upsert_env() {
  local file="$1" key="$2" value="$3"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

log "Patching indexer-sol .env (dual-write + Redis publish)…"
upsert_env "$INDEXER_ENV" "CLICKHOUSE_URL" "http://127.0.0.1:8123"
upsert_env "$INDEXER_ENV" "CLICKHOUSE_DUAL_WRITE" "true"
upsert_env "$INDEXER_ENV" "CLICKHOUSE_DATABASE" "pump"
upsert_env "$INDEXER_ENV" "REDIS_PUBLISH_ENABLED" "true"
if ! grep -qE '^REDIS_URL=' "$INDEXER_ENV" 2>/dev/null; then
  upsert_env "$INDEXER_ENV" "REDIS_URL" "redis://127.0.0.1:6379"
fi

log "Patching web .env (chart history from CH when available)…"
upsert_env "$WEB_ENV" "CLICKHOUSE_URL" "http://127.0.0.1:8123"
upsert_env "$WEB_ENV" "CLICKHOUSE_DATABASE" "pump"
upsert_env "$WEB_ENV" "USE_CLICKHOUSE_CANDLES" "true"
upsert_env "$WEB_ENV" "NEXT_PUBLIC_WS_ENABLED" "true"

if systemctl is-active --quiet pump-indexer-sol 2>/dev/null; then
  log "Restarting pump-indexer-sol…"
  systemctl restart pump-indexer-sol
fi

if command -v pm2 >/dev/null 2>&1; then
  log "Reloading Next (pm2 pump-tma) so USE_CLICKHOUSE_CANDLES is picked up…"
  pm2 reload pump-tma --update-env 2>/dev/null || pm2 restart pump-tma --update-env 2>/dev/null || true
fi

log "Backfill PG trades → ClickHouse (best-effort)…"
cd "$TMA_DIR"
if [[ -f "$INDEXER_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$INDEXER_ENV" 2>/dev/null || true
  set +a
fi
npm run backfill-clickhouse-trades -w @pump/indexer-sol 2>/dev/null || \
  log "WARN: trades backfill failed — run: npm run backfill-clickhouse-trades -w @pump/indexer-sol"
npm run backfill-clickhouse-candles -w @pump/indexer-sol 2>/dev/null || \
  log "WARN: candles_spot backfill failed — run: npm run backfill-clickhouse-candles -w @pump/indexer-sol"

log "Verify:"
curl -sf "http://127.0.0.1:8123/ping" && echo " clickhouse ping ok"
docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.trades_raw" || true
journalctl -u pump-indexer-sol -n 5 --no-pager || true
log "DONE — ClickHouse active, dual-write on, Redis publish on, chart CH read on"

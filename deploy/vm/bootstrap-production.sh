#!/usr/bin/env bash
# Pump TMA — one-time production VM bootstrap (Ubuntu 22.04/24.04, root)
#
# Prepare:
#   1. Clone repo to /var/www/pump/tma (or run from repo root)
#   2. scp cloudflare.txt → /root/cloudflare.txt  (Origin cert + key, gitignored locally)
#   3. cp deploy/vm/bootstrap.env.example deploy/vm/bootstrap.env && nano deploy/vm/bootstrap.env
#
# Run:
#   cd /var/www/pump/tma
#   bash deploy/vm/bootstrap-production.sh --confirm
#
# Safe re-run: skips existing DB, backs up .env before edits, idempotent apt/nginx/systemd.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_FROM_SCRIPT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONFIRM=0
ENV_FILE=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: bootstrap-production.sh [--env PATH] [--confirm] [--dry-run] [--no-git-sync]

  --env PATH     bootstrap.env (default: deploy/vm/bootstrap.env under repo)
  --confirm      required to apply changes (without it: preflight only)
  --dry-run      print planned steps, no mutations
  --no-git-sync  do not git fetch/reset (use after a failed run — keeps local script fixes)

EOF
}

NO_GIT_SYNC=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm) CONFIRM=1; shift ;;
    --env) ENV_FILE="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; CONFIRM=0; shift ;;
    --no-git-sync) NO_GIT_SYNC=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log() { echo "[bootstrap] $*"; }
warn() { echo "[bootstrap] WARN: $*" >&2; }
die() { echo "[bootstrap] ERROR: $*" >&2; exit 1; }
run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] $*"
    return 0
  fi
  log "+ $*"
  "$@"
}

require_root() {
  [[ "$(id -u)" -eq 0 ]] || die "Run as root (sudo bash deploy/vm/bootstrap-production.sh --confirm)"
}

load_env() {
  if [[ -z "$ENV_FILE" ]]; then
    if [[ -f "$REPO_FROM_SCRIPT/deploy/vm/bootstrap.env" ]]; then
      ENV_FILE="$REPO_FROM_SCRIPT/deploy/vm/bootstrap.env"
    else
      die "Missing deploy/vm/bootstrap.env — copy deploy/vm/bootstrap.env.example and edit"
    fi
  fi
  [[ -f "$ENV_FILE" ]] || die "Env file not found: $ENV_FILE"
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a

  REPO_ROOT="${REPO_ROOT:-/var/www/pump/tma}"
  PUMP_DOMAIN="${PUMP_DOMAIN:-pump.zugchain.org}"
  CF_ORIGIN_FILE="${CF_ORIGIN_FILE:-/root/cloudflare.txt}"
  BOOTSTRAP_SSH_PORT="${BOOTSTRAP_SSH_PORT:-22022}"
  GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/CadaFinance/pump.git}"
  GIT_REF="${GIT_REF:-main}"
  NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://${PUMP_DOMAIN}}"
  NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-wss://${PUMP_DOMAIN}/ws}"
  SKIP_FIRST_DEPLOY="${SKIP_FIRST_DEPLOY:-0}"

  SECRETS_FILE="/root/pump-bootstrap-secrets.txt"
  INDEXER_DIR="/var/www/pump/Indexer"
  CONTRACTS_OUT="/var/www/pump/contracts/out"
  DEPLOY_KEY="/root/.ssh/pump_tma_deploy"
}

preflight() {
  require_root
  load_env

  log "Preflight"
  log "  Repo root:     $REPO_ROOT"
  log "  Domain:        $PUMP_DOMAIN"
  log "  CF origin:     $CF_ORIGIN_FILE"
  log "  SSH port:      $BOOTSTRAP_SSH_PORT"
  log "  Confirm:       $CONFIRM  Dry-run: $DRY_RUN"

  [[ -f "$CF_ORIGIN_FILE" ]] || die "Cloudflare origin file missing: $CF_ORIGIN_FILE (scp cloudflare.txt to VM)"
  grep -q "BEGIN CERTIFICATE" "$CF_ORIGIN_FILE" || die "$CF_ORIGIN_FILE: no CERTIFICATE block"
  grep -q "BEGIN PRIVATE KEY" "$CF_ORIGIN_FILE" || die "$CF_ORIGIN_FILE: no PRIVATE KEY block"

  if [[ -d "$REPO_ROOT/.git" ]]; then
    log "  Git repo:      OK ($REPO_ROOT)"
  elif [[ "$REPO_FROM_SCRIPT" == *"/deploy/vm"* ]] && [[ -d "$REPO_FROM_SCRIPT/../../.git" ]]; then
    REPO_ROOT="$REPO_FROM_SCRIPT/../.."
    REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
    log "  Git repo:      OK (detected $REPO_ROOT)"
  else
    warn "Repo not at $REPO_ROOT — will clone during bootstrap"
  fi

  if [[ "$CONFIRM" -ne 1 ]] && [[ "$DRY_RUN" -ne 1 ]]; then
    cat <<EOF

[bootstrap] Preflight OK. No changes made.
Re-run with --confirm to apply:

  bash deploy/vm/bootstrap-production.sh --env $ENV_FILE --confirm

EOF
    exit 0
  fi
}

gen_secret() {
  openssl rand -hex 24
}

# Hosting panels (LiteSpeed, Apache) often bind :80 before nginx — stop them for Pump.
stop_conflicting_web_servers() {
  log "Checking port 80/443 conflicts"
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi

  local svc
  for svc in lsws lshttpd openlitespeed apache2; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
      warn "  Stopping $svc (uses :80/:443 — Pump needs nginx)"
      systemctl stop "$svc" || true
      systemctl disable "$svc" 2>/dev/null || true
    fi
  done

  if ss -tlnH 2>/dev/null | grep -q ':80 '; then
    warn "Port 80 still in use after stopping panel services:"
    ss -tlnp 2>/dev/null | grep ':80 ' || true
    warn "Stop the process above manually, then re-run bootstrap or: systemctl start nginx"
  fi
}

ensure_nginx_cloudflare_map_include() {
  local conf="/etc/nginx/nginx.conf"
  [[ -f "$conf" ]] || return 0
  if grep -q "pump-cloudflare-map.conf" "$conf"; then return 0; fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] add cloudflare map include to nginx.conf"
    return 0
  fi
  log "Adding pump-cloudflare-map include to $conf"
  sed -i '/^http {/a \    include /etc/nginx/conf.d/pump-cloudflare-map.conf;' "$conf"
}

start_or_reload_nginx() {
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi
  stop_conflicting_web_servers
  nginx -t
  systemctl enable nginx
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  else
    systemctl start nginx
  fi
  if ! systemctl is-active --quiet nginx; then
    die "nginx failed to start — run: journalctl -xeu nginx.service ; ss -tlnp | grep ':80 '"
  fi
  log "nginx is active"
}

install_apt_packages() {
  log "Installing system packages"
  run apt-get update -qq
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    curl git rsync jq ufw nginx redis-server postgresql postgresql-contrib \
    ca-certificates gnupg lsb-release build-essential

  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
    log "Installing Node.js 20.x"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y -qq nodejs
    fi
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    run npm install -g pm2
  fi

  run systemctl enable --now postgresql redis-server
  stop_conflicting_web_servers
  run systemctl enable nginx
  if [[ "$DRY_RUN" -eq 0 ]]; then
    systemctl start nginx 2>/dev/null || warn "nginx not started yet — will retry after site config"
  fi
}

configure_sshd_port() {
  local port="$1"
  [[ -z "$port" || "$port" == "22" ]] && return 0
  log "Ensuring sshd listens on port $port"
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi

  if grep -qE "^Port ${port}\b" /etc/ssh/sshd_config; then
    log "  sshd Port $port already configured"
    return 0
  fi
  if ! grep -qE "^Port " /etc/ssh/sshd_config; then
    echo "Port $port" >> /etc/ssh/sshd_config
  else
    warn "sshd already has Port directive — add Port $port manually if provider uses custom port"
    return 0
  fi
  systemctl reload ssh || systemctl reload sshd || true
}

install_cloudflare_origin_cert() {
  local src="$1" domain="$2"
  local cert_dir="/etc/nginx/ssl"
  local pem="${cert_dir}/${domain}.pem"
  local key="${cert_dir}/${domain}.key"

  log "Installing Cloudflare Origin certificate for $domain"
  run mkdir -p "$cert_dir"
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi

  awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/' "$src" > "$pem"
  awk '/BEGIN PRIVATE KEY/,/END PRIVATE KEY/' "$src" > "$key"
  chmod 644 "$pem"
  chmod 600 "$key"
  [[ -s "$pem" && -s "$key" ]] || die "Failed to extract cert/key from $src"
}

install_nginx() {
  local domain="$1"
  log "Configuring nginx for $domain"

  run mkdir -p /var/pump/assets
  run chown -R www-data:www-data /var/pump/assets

  run cp "$REPO_ROOT/deploy/nginx-cloudflare-map.conf" /etc/nginx/conf.d/pump-cloudflare-map.conf

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] install nginx site from deploy/nginx-pump-ssl.conf"
    return 0
  fi

  sed "s/pump\\.zugchain\\.org/${domain}/g" "$REPO_ROOT/deploy/nginx-pump-ssl.conf" \
    > /etc/nginx/sites-available/pump
  ln -sf /etc/nginx/sites-available/pump /etc/nginx/sites-enabled/pump
  rm -f /etc/nginx/sites-enabled/default

  ensure_nginx_cloudflare_map_include
  start_or_reload_nginx
}

ensure_repo() {
  if [[ "$NO_GIT_SYNC" -eq 1 ]]; then
    log "Skipping git sync (--no-git-sync)"
    [[ -d "$REPO_ROOT/.git" ]] || die "Repo missing at $REPO_ROOT"
    return 0
  fi
  log "Ensuring repo at $REPO_ROOT"
  if [[ -d "$REPO_ROOT/.git" ]]; then
    run git -C "$REPO_ROOT" fetch origin "$GIT_REF"
    run git -C "$REPO_ROOT" reset --hard "origin/$GIT_REF"
    return 0
  fi
  run mkdir -p "$(dirname "$REPO_ROOT")"
  run git clone --branch "$GIT_REF" "$GIT_REPO_URL" "$REPO_ROOT"
}

setup_postgres() {
  local app_pw="$1" idx_pw="$2"
  log "PostgreSQL: database pump_db + roles"

  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='pump_db'" | grep -q 1; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE pump_db;"
  else
    log "  pump_db exists — skipping CREATE DATABASE"
  fi

  if ! sudo -u postgres psql -d pump_db -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tokens' LIMIT 1" | grep -q 1; then
    log "  Applying schema.sql (first install)"
    sudo -u postgres psql -d pump_db -v ON_ERROR_STOP=1 -f "$REPO_ROOT/schema.sql"
  else
    warn "  tokens table exists — skipping schema.sql (use manual migration if upgrading)"
  fi

  awk -v idx="$idx_pw" -v app="$app_pw" '
    /CREATE USER pump_indexer/ { sub(/CHANGE_ME/, idx); print; next }
    /CREATE USER pump_app/     { sub(/CHANGE_ME/, app); print; next }
    { print }
  ' "$REPO_ROOT/deploy/pump_db_grants.sql" \
    | sudo -u postgres psql -d pump_db -v ON_ERROR_STOP=1 -f -
}

setup_pgbouncer() {
  log "PgBouncer (optional Tier 3)"
  if ! command -v pgbouncer >/dev/null 2>&1; then
    run apt-get install -y -qq pgbouncer || { warn "pgbouncer install failed — skip"; return 0; }
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi

  cp "$REPO_ROOT/deploy/pgbouncer.ini.snippet" /etc/pgbouncer/pgbouncer.ini
  bash "$REPO_ROOT/deploy/vm/phase-5-pgbouncer.sh" || warn "PgBouncer phase script had warnings"
}

patch_env_file() {
  local file="$1" app_pw="$2" idx_pw="$3" db_port="${4:-6432}"
  [[ -f "$file" ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi

  local bak="${file}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$file" "$bak"
  log "  Backed up $file → $bak"

  sed -i "s|postgres://pump_app:CHANGE_ME@127.0.0.1:15432/pump_db|postgres://pump_app:${app_pw}@127.0.0.1:${db_port}/pump_db|g" "$file"
  sed -i "s|postgres://pump_app:CHANGE_ME@127.0.0.1:5432/pump_db|postgres://pump_app:${app_pw}@127.0.0.1:${db_port}/pump_db|g" "$file"
  sed -i "s|postgres://pump_indexer:CHANGE_ME@127.0.0.1:6432/pump_db|postgres://pump_indexer:${idx_pw}@127.0.0.1:${db_port}/pump_db|g" "$file"
  sed -i "s|postgres://pump_indexer:CHANGE_ME@127.0.0.1:5432/pump_db|postgres://pump_indexer:${idx_pw}@127.0.0.1:${db_port}/pump_db|g" "$file"
  sed -i "s|DATABASE_URL=postgres://pump_app:CHANGE_ME|DATABASE_URL=postgres://pump_app:${app_pw}|g" "$file"

  if [[ -n "${ALCHEMY_RPC_KEY:-}" ]]; then
    sed -i "s|YOUR_ALCHEMY_API_KEY|${ALCHEMY_RPC_KEY}|g" "$file"
    sed -i "s|YOUR_KEY|${ALCHEMY_RPC_KEY}|g" "$file"
  fi
  if [[ -n "${AUTH_SESSION_SECRET:-}" ]]; then
    sed -i "s|AUTH_SESSION_SECRET=CHANGE_ME_USE_32_PLUS_CHAR_RANDOM_STRING|AUTH_SESSION_SECRET=${AUTH_SESSION_SECRET}|g" "$file"
  fi
  if [[ -n "${WALLET_ENCRYPTION_SECRET:-}" ]]; then
    sed -i "s|WALLET_ENCRYPTION_SECRET=CHANGE_ME_USE_32_PLUS_CHAR_RANDOM_STRING|WALLET_ENCRYPTION_SECRET=${WALLET_ENCRYPTION_SECRET}|g" "$file"
  fi
  sed -i "s|http://localhost:3012|${NEXT_PUBLIC_APP_URL}|g" "$file"
  sed -i "s|NEXT_PUBLIC_APP_URL=http://localhost:3012|NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}|g" "$file"
  grep -q '^NEXT_PUBLIC_WS_URL=' "$file" || echo "NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}" >> "$file"
  sed -i "s|NEXT_PUBLIC_WS_URL=.*|NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}|g" "$file"
  grep -q '^PGBOUNCER_ENABLED=' "$file" || echo 'PGBOUNCER_ENABLED=true' >> "$file"
  grep -q '^USE_REDIS_ARENA_CACHE=' "$file" || echo 'USE_REDIS_ARENA_CACHE=true' >> "$file"
}

write_app_envs() {
  local app_pw="$1" idx_pw="$2"
  local db_port="6432"
  if ! command -v pgbouncer >/dev/null 2>&1 || ! ss -tlnH 2>/dev/null | grep -q ':6432 '; then
    db_port="5432"
  fi

  log "Writing .env files (db port $db_port)"

  local tma_env="$REPO_ROOT/.env"
  local rt_env="$REPO_ROOT/apps/realtime/.env"
  local idx_env="$INDEXER_DIR/.env"

  if [[ ! -f "$tma_env" ]]; then
    run cp "$REPO_ROOT/.env.example" "$tma_env"
  fi
  if [[ -n "${OLD_TMA_ENV:-}" && -f "$OLD_TMA_ENV" ]]; then
    log "  Restoring TMA .env from $OLD_TMA_ENV"
    run cp "$OLD_TMA_ENV" "$tma_env"
  fi
  patch_env_file "$tma_env" "$app_pw" "$idx_pw" "$db_port"

  if [[ ! -f "$rt_env" ]]; then
    run cp "$REPO_ROOT/apps/realtime/.env.example" "$rt_env"
  fi
  if [[ "$DRY_RUN" -eq 0 ]]; then
    sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=${NEXT_PUBLIC_APP_URL},http://127.0.0.1:3012|g" "$rt_env"
  fi

  run mkdir -p "$INDEXER_DIR"
  if [[ ! -f "$idx_env" ]]; then
    run cp "$REPO_ROOT/apps/indexer/.env.example" "$idx_env"
  fi
  if [[ -n "${OLD_INDEXER_ENV:-}" && -f "$OLD_INDEXER_ENV" ]]; then
    log "  Restoring indexer .env from $OLD_INDEXER_ENV"
    run cp "$OLD_INDEXER_ENV" "$idx_env"
  fi
  patch_env_file "$idx_env" "$app_pw" "$idx_pw" "$db_port"
  if [[ -n "${AIRDROP_KEEPER_PRIVATE_KEY:-}" && "$DRY_RUN" -eq 0 ]]; then
    sed -i "s|AIRDROP_KEEPER_PRIVATE_KEY=0xCHANGE_ME_64_HEX_CHARS|AIRDROP_KEEPER_PRIVATE_KEY=${AIRDROP_KEEPER_PRIVATE_KEY}|g" "$idx_env"
  fi
  if [[ "$DRY_RUN" -eq 0 ]]; then
    grep -q '^CONTRACT_ARTIFACTS_DIR=' "$idx_env" || echo "CONTRACT_ARTIFACTS_DIR=${CONTRACTS_OUT}" >> "$idx_env"
    sed -i "s|^CONTRACT_ARTIFACTS_DIR=.*|CONTRACT_ARTIFACTS_DIR=${CONTRACTS_OUT}|g" "$idx_env"
  fi
}

install_systemd_units() {
  log "Installing systemd units (indexer + airdrop keeper)"
  run cp "$REPO_ROOT/deploy/pump-indexer.service" /etc/systemd/system/
  run cp "$REPO_ROOT/deploy/pump-airdrop-keeper.service" /etc/systemd/system/
  run systemctl daemon-reload
  run systemctl enable pump-indexer pump-airdrop-keeper
}

build_contract_artifacts() {
  log "Contract artifacts for indexer"
  run mkdir -p /var/www/pump/contracts
  if command -v forge >/dev/null 2>&1 && [[ -f "$REPO_ROOT/contracts/foundry.toml" ]]; then
    run bash -c "cd '$REPO_ROOT/contracts' && forge build"
    run rsync -a "$REPO_ROOT/contracts/out/" "$CONTRACTS_OUT/"
  elif [[ -d "$REPO_ROOT/contracts/out" ]]; then
    run rsync -a "$REPO_ROOT/contracts/out/" "$CONTRACTS_OUT/"
  else
    warn "No forge and no contracts/out — scp built artifacts to $CONTRACTS_OUT before indexer start"
  fi
}

setup_github_deploy_key() {
  log "GitHub Actions deploy SSH key"
  if [[ -f "$DEPLOY_KEY" ]]; then
    warn "  $DEPLOY_KEY exists — skipping keygen"
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi

  ssh-keygen -t ed25519 -f "$DEPLOY_KEY" -N "" -C "github-actions-pump-tma"
  chmod 600 "$DEPLOY_KEY"
  chmod 644 "${DEPLOY_KEY}.pub"
  if ! grep -qF "$(cat "${DEPLOY_KEY}.pub")" /root/.ssh/authorized_keys 2>/dev/null; then
    cat "${DEPLOY_KEY}.pub" >> /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
  fi
}

configure_firewall() {
  log "UFW — allow SSH, HTTP, HTTPS"
  if ! command -v ufw >/dev/null 2>&1; then return 0; fi
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi
  ufw allow "${BOOTSTRAP_SSH_PORT}/tcp" || true
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw --force enable || true
}

run_first_deploy() {
  if [[ "$SKIP_FIRST_DEPLOY" == "1" ]]; then
    warn "SKIP_FIRST_DEPLOY=1 — skipping tma-deploy.sh"
    return 0
  fi
  log "First deploy (npm ci + build + PM2)"
  run chmod +x "$REPO_ROOT/deploy/tma-deploy.sh"
  run bash -c "cd '$REPO_ROOT' && ./deploy/tma-deploy.sh"
}

save_secrets_summary() {
  local app_pw="$1" idx_pw="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi

  local vm_ip
  vm_ip="$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"

  cat > "$SECRETS_FILE" <<EOF
# Pump bootstrap secrets — $(date -Iseconds)
# chmod 600 — do not commit

VM_PUBLIC_IP=${vm_ip}
PUMP_DOMAIN=${PUMP_DOMAIN}
BOOTSTRAP_SSH_PORT=${BOOTSTRAP_SSH_PORT}

PUMP_APP_DB_PASSWORD=${app_pw}
PUMP_INDEXER_DB_PASSWORD=${idx_pw}

DATABASE_URL=postgres://pump_app:${app_pw}@127.0.0.1:6432/pump_db
INDEXER_DATABASE_URL=postgres://pump_indexer:${idx_pw}@127.0.0.1:6432/pump_db

GITHUB_DEPLOY_PUBLIC_KEY=$(cat "${DEPLOY_KEY}.pub" 2>/dev/null || echo "N/A")
EOF
  chmod 600 "$SECRETS_FILE"
}

print_post_install_checklist() {
  local vm_ip
  vm_ip="$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || echo 'YOUR_VM_IP')"

  cat <<EOF

================================================================================
  BOOTSTRAP COMPLETE — manual steps (do these before going live)
================================================================================

1) Cloudflare DNS
   - A record: ${PUMP_DOMAIN} → ${vm_ip}  (proxied / orange cloud ON)
   - SSL/TLS mode: Full (strict) — Origin cert already on VM

2) GitHub Actions secrets  (repo → Settings → Secrets → Actions)
   | Secret        | Value |
   |---------------|-------|
   | VM_HOST       | ${vm_ip} |
   | VM_USER       | root |
   | VM_SSH_PORT   | ${BOOTSTRAP_SSH_PORT} |
   | VM_SSH_KEY    | contents of: ${DEPLOY_KEY}  (PRIVATE key, entire file) |

3) Verify deploy key on VM
   ssh -p ${BOOTSTRAP_SSH_PORT} -i ${DEPLOY_KEY} root@${vm_ip} "echo ok"

4) Fill missing .env secrets (if placeholders remain)
   nano ${REPO_ROOT}/.env
   nano ${INDEXER_DIR}/.env
   Required: Telegram/OAuth, R2, TELEGRAM_*, indexer RPC, AIRDROP_KEEPER_PRIVATE_KEY

5) Restart after .env edits
   cd ${REPO_ROOT} && pm2 startOrRestart ecosystem.config.cjs --update-env
   systemctl restart pump-indexer pump-airdrop-keeper

6) Health checks
   curl -sf https://${PUMP_DOMAIN}/api/health
   curl -sf https://${PUMP_DOMAIN}/api/tokens?limit=5
   bash ${REPO_ROOT}/deploy/vm/system-health.sh | jq .overall

7) Update docs/ops-perf-playbook.md with new VM IP (${vm_ip})

8) CI/CD: push to main → .github/workflows/deploy.yml runs deploy/tma-deploy.sh
   Manual: gh workflow run deploy.yml -f mode=full

Secrets summary saved: ${SECRETS_FILE}

================================================================================
EOF
}

main() {
  preflight

  APP_PW="${PUMP_APP_DB_PASSWORD:-$(gen_secret)}"
  IDX_PW="${PUMP_INDEXER_DB_PASSWORD:-$(gen_secret)}"

  install_apt_packages
  configure_sshd_port "$BOOTSTRAP_SSH_PORT"
  ensure_repo
  REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"

  install_cloudflare_origin_cert "$CF_ORIGIN_FILE" "$PUMP_DOMAIN"
  install_nginx "$PUMP_DOMAIN"
  setup_postgres "$APP_PW" "$IDX_PW"
  setup_pgbouncer || true
  write_app_envs "$APP_PW" "$IDX_PW"
  build_contract_artifacts
  install_systemd_units
  setup_github_deploy_key
  configure_firewall

  run chmod +x "$REPO_ROOT/deploy/vm/indexer-deploy.sh" 2>/dev/null || true
  if [[ "$SKIP_FIRST_DEPLOY" != "1" ]]; then
    run_first_deploy
    if [[ "$DRY_RUN" -eq 0 ]]; then
      bash "$REPO_ROOT/deploy/vm/indexer-deploy.sh" || warn "indexer-deploy failed — fix .env/RPC and re-run"
      systemctl start pump-indexer pump-airdrop-keeper || true
    fi
  fi

  save_secrets_summary "$APP_PW" "$IDX_PW"
  print_post_install_checklist
}

main

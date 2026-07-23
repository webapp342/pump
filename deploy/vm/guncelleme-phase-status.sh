#!/usr/bin/env bash
# F0–F8 güncelleme faz diagnostiği — Solana prod VM + env audit.
# Usage: bash /var/www/pump/tma/deploy/vm/guncelleme-phase-status.sh
#        bash deploy/vm/guncelleme-phase-status.sh   (from repo root, any host)
set -uo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
WEB_ENV="${WEB_ENV:-${TMA_DIR}/.env}"
IDX_ENV="${IDX_ENV:-${TMA_DIR}/apps/indexer-sol/.env}"
CH_URL="${CH_URL:-http://127.0.0.1:8123}"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
section() { echo; echo "========== $* =========="; }

env_val() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | sed 's/[[:space:]]*$//'
}

truthy() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

section "HOST"
hostname -f 2>/dev/null || hostname
echo "TMA_DIR=$TMA_DIR"
if [[ -d "$TMA_DIR/.git" ]]; then
  git -C "$TMA_DIR" log -1 --oneline 2>/dev/null || true
fi
date -u +"%Y-%m-%dT%H:%M:%SZ"

section "CHAIN (Solana-only gate)"
CF="$(env_val "$WEB_ENV" NEXT_PUBLIC_CHAIN_FAMILY)"
echo "NEXT_PUBLIC_CHAIN_FAMILY=${CF:-<unset>}"
if [[ "${CF,,}" != "solana" ]]; then
  red "WARN: prod should be solana — run: bash deploy/vm/ensure-solana-env.sh"
else
  green "OK: Solana cutover flag"
fi
echo "NEXT_PUBLIC_SOLANA_CLUSTER=$(env_val "$WEB_ENV" NEXT_PUBLIC_SOLANA_CLUSTER)"
echo "SKIP_ALTO_BUNDLER=$(env_val "$WEB_ENV" SKIP_ALTO_BUNDLER)"
echo "SKIP_EVM_INDEXER=$(env_val "$WEB_ENV" SKIP_EVM_INDEXER)"

section "LEGACY EVM ENV (remove / ignore on Solana VM)"
LEGACY_KEYS=(
  BUNDLER_RPC_URL BUNDLER_CHAIN_ID BUNDLER_CHAIN_RPC_URL ALTO_
  NEXT_PUBLIC_CHAIN_ID NEXT_PUBLIC_RPC_URL NEXT_PUBLIC_TRADE_RPC_URL
  NEXT_PUBLIC_TRADE_WSS_URL NEXT_PUBLIC_FLASHBLOCKS NEXT_PUBLIC_MEME_FACTORY
  NEXT_PUBLIC_BONDING_CURVE_MANAGER NEXT_PUBLIC_AIRDROP_MANAGER
  ZERO_DEV KERNEL PAYMASTER
)
legacy_found=0
for f in "$WEB_ENV" "$IDX_ENV"; do
  [[ -f "$f" ]] || continue
  while IFS= read -r line; do
    key="${line%%=*}"
    key="${key// /}"
    for pat in "${LEGACY_KEYS[@]}"; do
      if [[ "$key" == *"$pat"* ]] || [[ "$key" == "$pat" ]]; then
        echo "  $f: $key=... (legacy EVM — safe to delete on Solana)"
        legacy_found=1
      fi
    done
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$f" 2>/dev/null || true)
done
[[ "$legacy_found" -eq 0 ]] && green "No obvious EVM keys in web/indexer-sol .env"

section "GÜNCELLEME FLAGS (web .env)"
for k in \
  USE_CLICKHOUSE_CANDLES CLICKHOUSE_URL CLICKHOUSE_DATABASE \
  REDIS_URL USE_REDIS_WEEKLY_XP USE_REDIS_ARENA_CACHE \
  SKIP_PG_TOKEN_CANDLES NEXT_PUBLIC_WS_ENABLED NEXT_PUBLIC_WS_URL \
  USE_TOKEN_BOARD_STATS LAUNCHPAD_DATABASE_READ_URL PGBOUNCER_ENABLED
do
  v="$(env_val "$WEB_ENV" "$k")"
  [[ -n "$v" ]] && echo "$k=$v"
done

section "GÜNCELLEME FLAGS (indexer-sol .env)"
for k in \
  REDIS_URL REDIS_PUBLISH_ENABLED \
  CLICKHOUSE_URL CLICKHOUSE_DUAL_WRITE CLICKHOUSE_VIA_REDIS_STREAM \
  SKIP_PG_TOKEN_CANDLES INCREMENTAL_BOARD_STATS INCREMENTAL_CANDLES \
  SOLANA_INDEXER_SOURCE USE_REDIS_WEEKLY_XP
do
  v="$(env_val "$IDX_ENV" "$k")"
  [[ -n "$v" ]] && echo "$k=$v"
done

section "SERVICES (pm2 + systemd)"
pm2 jlist 2>/dev/null | node -e "
const apps = JSON.parse(require('fs').readFileSync(0,'utf8')||'[]');
for (const n of ['pump-tma','pump-realtime','pump-ch-flusher','pump-price-worker']) {
  const a = apps.find(x => x.name === n);
  console.log(n + ': ' + (a?.pm2_env?.status ?? 'missing'));
}
" 2>/dev/null || pm2 list 2>/dev/null | head -20

for u in pump-indexer-sol pump-indexer pump-indexer-sol-go; do
  st="$(systemctl is-active "$u" 2>/dev/null || echo inactive)"
  echo "systemd $u: $st"
done

section "REDIS"
REDIS_URL="$(env_val "$WEB_ENV" REDIS_URL)"
REDIS_URL="${REDIS_URL:-$(env_val "$IDX_ENV" REDIS_URL)}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
echo "REDIS_URL=$REDIS_URL"
if redis-cli -u "$REDIS_URL" PING 2>/dev/null | grep -q PONG; then
  green "Redis PONG"
  echo "price:native:sol:usd=$(redis-cli -u "$REDIS_URL" GET price:native:sol:usd 2>/dev/null)"
  echo "XLEN pump:ch:trades=$(redis-cli -u "$REDIS_URL" XLEN pump:ch:trades 2>/dev/null)"
  echo "XLEN pump:ch:candles=$(redis-cli -u "$REDIS_URL" XLEN pump:ch:candles 2>/dev/null)"
  echo "season:current EXISTS=$(redis-cli -u "$REDIS_URL" EXISTS season:current 2>/dev/null)"
  echo "weekly_user_xp ZCARD=$(redis-cli -u "$REDIS_URL" ZCARD weekly_user_xp 2>/dev/null)"
else
  red "Redis unreachable"
fi

section "CLICKHOUSE (F0 gate)"
CH_URL_ENV="$(env_val "$WEB_ENV" CLICKHOUSE_URL)"
[[ -n "$CH_URL_ENV" ]] && CH_URL="$CH_URL_ENV"
echo "CLICKHOUSE_URL=$CH_URL"
if curl -sf "${CH_URL}/ping" >/dev/null 2>&1; then
  green "CH ping OK"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q pump-clickhouse; then
    docker exec pump-clickhouse clickhouse-client -q "SELECT count() AS candles_spot FROM pump.candles_spot" 2>/dev/null || yellow "candles_spot count failed"
    docker exec pump-clickhouse clickhouse-client -q "SELECT count() AS trades_raw FROM pump.trades_raw" 2>/dev/null || true
    docker exec pump-clickhouse cat /etc/clickhouse-server/config.d/memory.xml 2>/dev/null | grep -E 'ratio|memory' || true
  else
    curl -sf "${CH_URL}/?query=SELECT%20count()%20FROM%20pump.candles_spot" 2>/dev/null || yellow "remote count query failed"
  fi
else
  red "CH ping FAILED"
fi

section "POSTGRES (positions SSOT — always required)"
if sudo -u postgres psql -d pump_db -tAc "SELECT 1" 2>/dev/null | grep -q 1; then
  green "PG OK"
  sudo -u postgres psql -d pump_db -tAc \
    "SELECT key, last_block_number, EXTRACT(EPOCH FROM (now()-updated_at))::int AS age_s FROM indexer_state WHERE key LIKE 'solana%' ORDER BY updated_at DESC LIMIT 1" 2>/dev/null || true
  sudo -u postgres psql -d pump_db -tAc \
    "SELECT count(*) FROM token_candles" 2>/dev/null | xargs -I{} echo "token_candles rows: {}"
else
  red "PG query failed"
fi

section "F0 — chart parity (compared_ch gate)"
if [[ -d "$TMA_DIR" ]]; then
  cd "$TMA_DIR"
  set +e
  npm run check-chart-parity -w @pump/indexer-sol 2>&1 | tail -15
  PARITY=$?
  set -e
  if [[ "$PARITY" -eq 0 ]]; then
    green "F0 parity: GREEN (compared_ch > 0)"
  else
    red "F0 parity: FAIL (exit=$PARITY) — BLOCKER for F2/F6"
  fi
else
  yellow "Skip parity — TMA_DIR missing"
  PARITY=99
fi

section "CHART HTTP probe (web runtime path)"
# Sample token from PG if available
SAMPLE="$(sudo -u postgres psql -d pump_db -tAc \
  "SELECT token_address FROM token_candles ORDER BY updated_at DESC LIMIT 1" 2>/dev/null | tr -d ' ' || true)"
if [[ -n "$SAMPLE" ]]; then
  echo "Sample token: $SAMPLE"
  curl -sf "http://127.0.0.1:3012/api/tokens/${SAMPLE}/candles?interval=5m&limit=3" 2>/dev/null | head -c 400 || \
    curl -sf "http://127.0.0.1/api/tokens/${SAMPLE}/candles?interval=5m&limit=3" 2>/dev/null | head -c 400 || \
    yellow "candles API probe failed"
  echo
  pm2 logs pump-tma --lines 30 --nostream 2>/dev/null | grep -E 'chart_olap_source|olap' | tail -5 || true
fi

section "FAZ VERDICT (Solana güncelleme yolu)"
USE_CH="$(env_val "$WEB_ENV" USE_CLICKHOUSE_CANDLES)"
STREAM="$(env_val "$IDX_ENV" CLICKHOUSE_VIA_REDIS_STREAM)"
SKIP_PG="$(env_val "$IDX_ENV" SKIP_PG_TOKEN_CANDLES)"
F0="BLOCKED"; [[ "${PARITY:-99}" -eq 0 ]] && F0="DONE"
F1="PENDING"
truthy "$(env_val "$WEB_ENV" USE_REDIS_WEEKLY_XP)" && [[ "$(redis-cli -u "$REDIS_URL" ZCARD weekly_user_xp 2>/dev/null || echo 0)" -gt 0 ]] && F1="SMOKE_OK" || \
  truthy "$(env_val "$WEB_ENV" USE_REDIS_WEEKLY_XP)" && F1="IN_PROGRESS"
F2="PAUSED"; pm2 jlist 2>/dev/null | grep -q pump-ch-flusher && F2="FLUSHER_ON"
truthy "$STREAM" && F2="STREAM_ON"
F6="PENDING"; truthy "$SKIP_PG" && F6="ENABLED"
F7="PENDING"
pm2 jlist 2>/dev/null | grep -q pump-price-worker && F7="PRICE_WORKER_ON"
redis-cli -u "$REDIS_URL" GET price:native:sol:usd 2>/dev/null | grep -q . && F7="DONE"

echo "F0 Spec+CH ops     : $F0"
echo "F1 Redis XP        : $F1"
echo "F2 CH flusher      : $F2  (stream flag should stay OFF until F0 green)"
echo "F3 Program fee v2  : CODE_ONLY (on-chain deploy yok)"
echo "F4 Settlement      : SCAFFOLD"
echo "F5 Go indexer      : SCAFFOLD"
echo "F6 PG offload      : $F6"
echo "F7 Price worker    : $F7"
echo "F8 Hardening       : ONGOING"

echo
if truthy "$USE_CH" && [[ "$F0" == "BLOCKED" ]]; then
  yellow "USE_CLICKHOUSE_CANDLES=true AMA F0 parity red → chart history CH boş/kısmi, PG fallback veya kötü mum riski."
  yellow "Plana göre: önce bash deploy/vm/f0-ch-recover.sh → parity green, sonra F2 stream."
elif truthy "$USE_CH" && [[ "$F0" == "DONE" ]]; then
  green "USE_CLICKHOUSE_CANDLES=true + parity green → doğru cutover noktası."
fi

echo
echo "Sonraki adım (kritik yol):"
if [[ "$F0" != "DONE" ]]; then
  echo "  1) bash deploy/vm/f0-ch-recover.sh"
  echo "  2) pm2 restart pump-tma --update-env"
elif [[ "$F2" != "STREAM_ON" ]]; then
  echo "  1) indexer-sol .env → CLICKHOUSE_VIA_REDIS_STREAM=true"
  echo "  2) systemctl restart pump-indexer-sol && pm2 restart pump-ch-flusher"
else
  echo "  F1 smoke: trade + redis-cli ZSCORE weekly_user_xp <TRADER_WALLET>"
fi

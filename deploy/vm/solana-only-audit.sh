#!/usr/bin/env bash
# Solana-only + güncelleme faz audit — VM veya local (bash).
# Usage:
#   bash deploy/vm/solana-only-audit.sh
#   bash deploy/vm/solana-only-audit.sh 2>&1 | tee /tmp/pump-audit.txt
#
# Env temizliği (dry-run önce, sonra APPLY=1):
#   APPLY=1 bash deploy/vm/solana-only-audit.sh --cleanup-evm-env
set -uo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
WEB_ENV="${TMA_DIR}/.env"
IDX_SOL="${TMA_DIR}/apps/indexer-sol/.env"
IDX_EVM="${TMA_DIR}/apps/indexer/.env"
RT_ENV="${TMA_DIR}/apps/realtime/.env"
LEGACY_IDX="/var/www/pump/Indexer/.env"
DO_CLEANUP=0
[[ "${1:-}" == "--cleanup-evm-env" ]] && DO_CLEANUP=1

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
section() { echo; echo "══════════════════════════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════════════════════════"; }

env_val() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | sed 's/[[:space:]]*$//'
}

is_evm_env_key() {
  local key="$1"
  case "$key" in
    BUNDLER_*|ALTO_*|SKANDHA_*|PIMLICO_*|ZERO_DEV_*|KERNEL_*|PAYMASTER_*)
      return 0 ;;
    NEXT_PUBLIC_CHAIN_ID|CHAIN_ID|NEXT_PUBLIC_RPC_URL|RPC_URL)
      return 0 ;;
    NEXT_PUBLIC_TRADE_*|NEXT_PUBLIC_FLASHBLOCKS*|NEXT_PUBLIC_BUNDLER_*)
      return 0 ;;
    NEXT_PUBLIC_MEME_*|NEXT_PUBLIC_BONDING_*|NEXT_PUBLIC_AIRDROP_*)
      return 0 ;;
    INDEXER_START_BLOCK|FACTORY_ADDRESS|BONDING_CURVE_MANAGER|AIRDROP_MANAGER)
      return 0 ;;
    BUNDLER_EXECUTOR_*|BUNDLER_UTILITY_*|BUNDLER_RELAYER_*)
      return 0 ;;
    *)
      [[ "$key" == *BUNDLER* ]] && return 0
      [[ "$key" == *ALTO* ]] && return 0
      [[ "$key" == *MEME_FACTORY* ]] && return 0
      [[ "$key" == *AIRDROP* ]] && [[ "$key" != *SOLANA* ]] && return 0
      return 1 ;;
  esac
}

scan_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  echo "── $file ($(wc -l < "$file" | tr -d ' ') lines) ──"
  local evm=0 sol=0 other=0
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"
    key="${key// /}"
    if is_evm_env_key "$key"; then
      echo "  [EVM-REMOVE] $key"
      evm=$((evm + 1))
    elif [[ "$key" == SOLANA_* ]] || [[ "$key" == NEXT_PUBLIC_SOLANA_* ]] || [[ "$key" == NEXT_PUBLIC_CHAIN_FAMILY ]]; then
      echo "  [SOLANA-OK]  $key"
      sol=$((sol + 1))
    elif [[ "$key" == REDIS_* ]] || [[ "$key" == CLICKHOUSE_* ]] || [[ "$key" == USE_* ]] || [[ "$key" == SKIP_* ]]; then
      echo "  [GUNCELLEME] $key"
      other=$((other + 1))
    elif [[ "$key" == DATABASE_* ]] || [[ "$key" == LAUNCHPAD_* ]] || [[ "$key" == VM1_* ]] || [[ "$key" == AUTH_* ]] || [[ "$key" == TELEGRAM_* ]] || [[ "$key" == NEXT_PUBLIC_WS_* ]] || [[ "$key" == NEXT_PUBLIC_APP_* ]] || [[ "$key" == R2_* ]] || [[ "$key" == NEXT_PUBLIC_ASSETS_* ]] || [[ "$key" == WALLET_* ]] || [[ "$key" == NODE_ENV ]] || [[ "$key" == PORT ]]; then
      echo "  [CORE-OK]    $key"
      other=$((other + 1))
    else
      echo "  [REVIEW]     $key"
      other=$((other + 1))
    fi
  done < "$file"
  echo "  → EVM keys to remove: $evm | Solana: $sol | other: $other"
}

cleanup_evm_from_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local tmp
  tmp="$(mktemp)"
  local removed=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^[[:space:]]*# ]]; then
      echo "$line" >> "$tmp"
      continue
    fi
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      key="${line%%=*}"
      key="${key// /}"
      if is_evm_env_key "$key"; then
        echo "# REMOVED-EVM $(date -u +%Y-%m-%d) $line" >> "$tmp"
        removed=$((removed + 1))
        continue
      fi
    fi
    echo "$line" >> "$tmp"
  done < "$file"
  if [[ "$removed" -gt 0 ]]; then
    if [[ "${APPLY:-0}" == "1" ]]; then
      cp "$file" "${file}.bak.$(date +%Y%m%d%H%M%S)"
      mv "$tmp" "$file"
      green "Cleaned $removed EVM keys from $file (backup .bak.*)"
    else
      rm -f "$tmp"
      yellow "DRY-RUN: would remove $removed EVM keys from $file — APPLY=1 to apply"
    fi
  else
    rm -f "$tmp"
    green "No EVM keys in $file"
  fi
}

section "1. HOST & GIT"
echo "hostname: $(hostname -f 2>/dev/null || hostname)"
echo "TMA_DIR=$TMA_DIR"
[[ -d "$TMA_DIR/.git" ]] && git -C "$TMA_DIR" log -1 --oneline 2>/dev/null || echo "(no git)"
date -u +"%Y-%m-%dT%H:%M:%SZ"

section "2. CHAIN — Solana-only olmalı"
CF="$(env_val "$WEB_ENV" NEXT_PUBLIC_CHAIN_FAMILY)"
echo "NEXT_PUBLIC_CHAIN_FAMILY=${CF:-<unset>}"
[[ "${CF,,}" == "solana" ]] && green "OK" || red "YANLIŞ — bash deploy/vm/ensure-solana-env.sh $WEB_ENV"
for k in SKIP_ALTO_BUNDLER SKIP_EVM_INDEXER NEXT_PUBLIC_SOLANA_CLUSTER SOLANA_CHAIN_ID; do
  v="$(env_val "$WEB_ENV" "$k")"
  [[ -n "$v" ]] && echo "$k=$v"
done

section "3. ENV DOSYALARI — tam tarama"
for f in "$WEB_ENV" "$IDX_SOL" "$IDX_EVM" "$RT_ENV" "$LEGACY_IDX"; do
  scan_env_file "$f"
done

section "4. SOLANA ZORUNLU — eksik mi?"
REQUIRED_WEB=(
  NEXT_PUBLIC_CHAIN_FAMILY NEXT_PUBLIC_SOLANA_RPC_URL
  NEXT_PUBLIC_SOLANA_FACTORY_PROGRAM_ID DATABASE_URL LAUNCHPAD_DATABASE_URL
  AUTH_SESSION_SECRET REDIS_URL
)
REQUIRED_IDX=(
  LAUNCHPAD_DATABASE_URL SOLANA_RPC_URL REDIS_URL REDIS_PUBLISH_ENABLED
)
missing=0
for k in "${REQUIRED_WEB[@]}"; do
  v="$(env_val "$WEB_ENV" "$k")"
  if [[ -z "$v" ]]; then red "WEB MISSING: $k"; missing=$((missing + 1)); fi
done
for k in "${REQUIRED_IDX[@]}"; do
  v="$(env_val "$IDX_SOL" "$k")"
  if [[ -z "$v" ]]; then red "INDEXER-SOL MISSING: $k"; missing=$((missing + 1)); fi
done
[[ "$missing" -eq 0 ]] && green "Zorunlu Solana env tam"

section "5. GÜNCELLEME FLAGS (aktif yol)"
echo "--- web ---"
for k in USE_CLICKHOUSE_CANDLES CLICKHOUSE_URL REDIS_URL USE_REDIS_WEEKLY_XP \
  USE_REDIS_ARENA_CACHE SKIP_PG_TOKEN_CANDLES NEXT_PUBLIC_WS_ENABLED NEXT_PUBLIC_WS_URL; do
  v="$(env_val "$WEB_ENV" "$k")"; [[ -n "$v" ]] && echo "$k=$v"
done
echo "--- indexer-sol ---"
for k in CLICKHOUSE_DUAL_WRITE CLICKHOUSE_VIA_REDIS_STREAM SKIP_PG_TOKEN_CANDLES \
  INCREMENTAL_BOARD_STATS INCREMENTAL_CANDLES SOLANA_INDEXER_SOURCE; do
  v="$(env_val "$IDX_SOL" "$k")"; [[ -n "$v" ]] && echo "$k=$v"
done

section "6. SERVİSLER — EVM kalmamalı"
echo "--- PM2 ---"
pm2 jlist 2>/dev/null | node -e "
const apps = JSON.parse(require('fs').readFileSync(0,'utf8')||'[]');
const want = ['pump-tma','pump-realtime','pump-ch-flusher','pump-price-worker'];
const evm = ['pump-alto','alto','pump-indexer-evm'];
for (const a of apps) {
  const n = a.name;
  const st = a.pm2_env?.status ?? '?';
  if (want.includes(n)) console.log('[SOLANA-OK] '+n+': '+st);
  else if (/alto|bundler|skandha|indexer(?!-sol)/i.test(n) && !n.includes('indexer-sol'))
    console.log('[EVM-REMOVE] '+n+': '+st);
  else if (!want.includes(n)) console.log('[REVIEW]     '+n+': '+st);
}
" 2>/dev/null || pm2 list 2>/dev/null | head -25

echo "--- systemd ---"
for u in pump-indexer-sol pump-indexer pump-airdrop-keeper pump-indexer-sol-go; do
  st="$(systemctl is-active "$u" 2>/dev/null || echo inactive)"
  en="$(systemctl is-enabled "$u" 2>/dev/null || echo disabled)"
  case "$u" in
    pump-indexer-sol)
      [[ "$st" == "active" ]] && echo "[SOLANA-OK]  $u: $st ($en)" || red "[SOLANA-FIX] $u: $st ($en)" ;;
    pump-indexer|pump-airdrop-keeper)
      [[ "$st" == "active" ]] && red "[EVM-STOP]   $u: $st ($en) — systemctl stop+disable" || green "[EVM-OK]     $u: $st ($en)" ;;
    *) echo "[REVIEW]     $u: $st ($en)" ;;
  esac
done

echo "--- docker (EVM/CH) ---"
docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | grep -E 'clickhouse|alto|NAME' || echo "(docker yok veya boş)"

section "7. REDIS + CLICKHOUSE + PG"
R="$(env_val "$WEB_ENV" REDIS_URL)"; R="${R:-$(env_val "$IDX_SOL" REDIS_URL)}"; R="${R:-redis://127.0.0.1:6379}"
echo "REDIS: $(redis-cli -u "$R" PING 2>/dev/null || echo FAIL)"
redis-cli -u "$R" GET price:native:sol:usd 2>/dev/null | xargs -I{} echo "  price:native:sol:usd={}"
redis-cli -u "$R" XLEN pump:ch:trades 2>/dev/null | xargs -I{} echo "  XLEN pump:ch:trades={}"
redis-cli -u "$R" ZCARD weekly_user_xp 2>/dev/null | xargs -I{} echo "  ZCARD weekly_user_xp={}"

CH="$(env_val "$WEB_ENV" CLICKHOUSE_URL)"; CH="${CH:-http://127.0.0.1:8123}"
echo "CH ping: $(curl -sf "${CH}/ping" 2>/dev/null || echo FAIL)"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q pump-clickhouse; then
  docker exec pump-clickhouse clickhouse-client -q "SELECT 'candles_spot', count() FROM pump.candles_spot UNION ALL SELECT 'trades_raw', count() FROM pump.trades_raw" 2>/dev/null || true
fi

sudo -u postgres psql -d pump_db -tAc \
  "SELECT 'indexer_sol', key, last_block_number, EXTRACT(EPOCH FROM (now()-updated_at))::int FROM indexer_state WHERE key LIKE 'solana%' ORDER BY updated_at DESC LIMIT 1" 2>/dev/null || echo "PG: skip (no sudo postgres)"

section "8. FAZ ÖZET (guncelleme-ilerleme.md)"
CH_COUNT=0
docker ps --format '{{.Names}}' 2>/dev/null | grep -q pump-clickhouse && \
  CH_COUNT="$(docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.candles_spot" 2>/dev/null || echo 0)"
STREAM="$(env_val "$IDX_SOL" CLICKHOUSE_VIA_REDIS_STREAM)"
SKIP_PG="$(env_val "$IDX_SOL" SKIP_PG_TOKEN_CANDLES)"
F0=$([[ "${CH_COUNT:-0}" -gt 0 ]] && echo OK || echo NEEDS_BACKFILL)
F2="FLUSHER_OFF"
pm2 jlist 2>/dev/null | grep -q '"name":"pump-ch-flusher"' && F2="FLUSHER_ON"
[[ "${STREAM,,}" == "true" ]] && F2="STREAM_ON"
F7="OFF"
pm2 jlist 2>/dev/null | grep -q '"name":"pump-price-worker"' && F7="ON"
redis-cli -u "$R" GET price:native:sol:usd 2>/dev/null | grep -q . && F7="DONE"

cat <<EOF
F0 CH ops/backfill  : $F0
F1 Redis XP         : $(env_val "$WEB_ENV" USE_REDIS_WEEKLY_XP) (smoke: trade→ZSCORE trader wallet)
F2 CH flusher/stream: $F2
F3 Program fee v2   : CODE_ONLY
F4 Settlement       : SCAFFOLD
F5 Go indexer       : SCAFFOLD
F6 SKIP_PG candles  : ${SKIP_PG:-false}
F7 Price worker     : $F7
F8 Hardening        : ONGOING
(parity 7d gate İPTAL — docs/guncelleme-ilerleme.md#decision-no-parity-gate)
EOF

section "9. EVM TEMİZLİK KOMUTLARI (manuel)"
cat <<'CMD'
# Servisler (EVM kes)
sudo systemctl stop pump-indexer pump-airdrop-keeper 2>/dev/null || true
sudo systemctl disable pump-indexer pump-airdrop-keeper 2>/dev/null || true
pm2 stop pump-alto alto 2>/dev/null; pm2 delete pump-alto alto 2>/dev/null; pm2 save

# Solana env pin
bash deploy/vm/ensure-solana-env.sh /var/www/pump/tma/.env

# EVM env satırları (script ile)
APPLY=1 bash deploy/vm/solana-only-audit.sh --cleanup-evm-env

# Eski indexer dizini (varsa)
ls -la /var/www/pump/Indexer 2>/dev/null && echo "→ legacy EVM indexer dir — arşivle/sil"

# Solana indexer yeniden
systemctl restart pump-indexer-sol
pm2 restart pump-tma pump-realtime --update-env
CMD

if [[ "$DO_CLEANUP" -eq 1 ]]; then
  section "10. EVM ENV CLEANUP"
  for f in "$WEB_ENV" "$IDX_SOL"; do
    cleanup_evm_from_file "$f"
  done
fi

section "BİTTİ — çıktıyı chat'e yapıştır"
echo "Full audit saved? tee /tmp/pump-audit.txt"

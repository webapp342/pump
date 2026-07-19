#!/usr/bin/env bash
# Shared Solana production env defaults for VM deploy scripts.
# Sourced by deploy/tma-deploy.sh and deploy/ui-deploy.sh — do not execute directly.

PUMP_SOLANA_LAUNCHPAD_PROGRAM_ID="${PUMP_SOLANA_LAUNCHPAD_PROGRAM_ID:-Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus}"

ensure_env_kv() {
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -qE "^[[:space:]]*${key}=" "$file" 2>/dev/null; then
    sed -i "s|^[[:space:]]*${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

resolve_solana_rpc_url() {
  local cluster="${1:-devnet}"
  if [[ -n "${SOLANA_RPC_URL:-}" ]]; then
    echo "$SOLANA_RPC_URL"
    return 0
  fi
  if [[ -n "${HELIUS_API_KEY:-}" ]]; then
    local host="devnet.helius-rpc.com"
    case "$cluster" in
      mainnet-beta|mainnet) host="mainnet.helius-rpc.com" ;;
    esac
    echo "https://${host}/?api-key=${HELIUS_API_KEY}"
    return 0
  fi
  case "$cluster" in
    mainnet-beta|mainnet) echo "https://api.mainnet-beta.solana.com" ;;
    localnet|local) echo "http://127.0.0.1:8899" ;;
    *) echo "https://api.devnet.solana.com" ;;
  esac
}

# Patch root .env for Solana live product (build-time NEXT_PUBLIC_* + server RPC).
ensure_solana_production_env() {
  local env_file="${1:-}"
  if [[ -z "$env_file" || ! -f "$env_file" ]]; then
    echo "[solana-env] WARN: missing .env — skip Solana patch"
    return 0
  fi

  local cluster="${SOLANA_CLUSTER:-${NEXT_PUBLIC_SOLANA_CLUSTER:-devnet}}"
  local rpc
  rpc="$(resolve_solana_rpc_url "$cluster")"
  local pid="$PUMP_SOLANA_LAUNCHPAD_PROGRAM_ID"

  echo "[solana-env] Production chain family → solana (cluster=${cluster})"

  ensure_env_kv "$env_file" "NEXT_PUBLIC_CHAIN_FAMILY" "solana"
  ensure_env_kv "$env_file" "NEXT_PUBLIC_SOLANA_CLUSTER" "$cluster"
  ensure_env_kv "$env_file" "NEXT_PUBLIC_SOLANA_RPC_URL" "$rpc"
  ensure_env_kv "$env_file" "NEXT_PUBLIC_SOLANA_FACTORY_PROGRAM_ID" "$pid"
  ensure_env_kv "$env_file" "NEXT_PUBLIC_SOLANA_CURVE_PROGRAM_ID" "$pid"
  ensure_env_kv "$env_file" "NEXT_PUBLIC_SOLANA_TREASURY_PROGRAM_ID" "$pid"

  ensure_env_kv "$env_file" "SOLANA_RPC_URL" "$rpc"
  ensure_env_kv "$env_file" "SOLANA_CLUSTER" "$cluster"
  ensure_env_kv "$env_file" "SOLANA_FACTORY_PROGRAM_ID" "$pid"
  ensure_env_kv "$env_file" "SOLANA_CURVE_PROGRAM_ID" "$pid"
  ensure_env_kv "$env_file" "SOLANA_TREASURY_PROGRAM_ID" "$pid"
  ensure_env_kv "$env_file" "SOLANA_INDEXER_SOURCE" "rpc"

  # EVM indexer + Alto bundler not used on Solana live path.
  ensure_env_kv "$env_file" "SKIP_EVM_INDEXER_DEPLOY" "1"
}

#!/usr/bin/env bash
# Upsert contract_registry from deployment JSON (preferred) or seed SQL fallback.
set -euo pipefail

REPO="${REPO:-/var/www/pump/tma}"
DB="${DB:-pump_db}"

log() { echo "[seed-contract-registry] $*"; }
warn() { echo "[seed-contract-registry] WARN: $*" >&2; }

launchpad_json="$REPO/contracts/deployments/base-sepolia-launchpad.json"
airdrop_json="$REPO/contracts/deployments/base-sepolia-airdrop.json"
seed_sql="$REPO/db/scripts/seed_base_sepolia_registry.sql"

if command -v jq >/dev/null 2>&1 && [[ -f "$launchpad_json" ]]; then
  chain_id="$(jq -r '.chainId // 84532' "$launchpad_json")"
  meme_factory="$(jq -r '.memeFactory // empty' "$launchpad_json" | tr '[:upper:]' '[:lower:]')"
  bonding="$(jq -r '.bondingCurveManager // empty' "$launchpad_json" | tr '[:upper:]' '[:lower:]')"
  airdrop=""
  if [[ -f "$airdrop_json" ]]; then
    airdrop="$(jq -r '.pumpAirdropManager // empty' "$airdrop_json" | tr '[:upper:]' '[:lower:]')"
  fi

  if [[ -z "$meme_factory" || -z "$bonding" ]]; then
    warn "deployment JSON missing memeFactory or bondingCurveManager — trying SQL seed"
  else
    log "Upsert from $launchpad_json (chain_id=$chain_id)"
    sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 <<EOF
INSERT INTO contract_registry (contract_key, chain_id, address, is_active, updated_at)
VALUES
  ('meme_factory', ${chain_id}, '${meme_factory}', true, now()),
  ('bonding_curve_manager', ${chain_id}, '${bonding}', true, now())
ON CONFLICT (contract_key) DO UPDATE
SET chain_id = EXCLUDED.chain_id,
    address = EXCLUDED.address,
    is_active = true,
    updated_at = now();
EOF
    if [[ -n "$airdrop" ]]; then
      sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 <<EOF
INSERT INTO contract_registry (contract_key, chain_id, address, is_active, updated_at)
VALUES ('pump_airdrop_manager', ${chain_id}, '${airdrop}', true, now())
ON CONFLICT (contract_key) DO UPDATE
SET chain_id = EXCLUDED.chain_id,
    address = EXCLUDED.address,
    is_active = true,
    updated_at = now();
EOF
    fi
    log "contract_registry rows:"
    sudo -u postgres psql -d "$DB" -c "SELECT contract_key, chain_id, address, is_active FROM contract_registry ORDER BY contract_key;"
    exit 0
  fi
fi

if [[ -f "$seed_sql" ]]; then
  log "Applying $seed_sql"
  sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f "$seed_sql"
  exit 0
fi

warn "No deployment JSON or seed SQL — set addresses manually or run Admin wipe sync"
exit 1

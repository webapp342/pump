#!/usr/bin/env bash
# Apply pending SQL migrations once (schema_migrations ledger). Safe for CI/CD every deploy.
# Usage: bash deploy/vm/run-pending-migrations.sh [/var/www/pump/tma]
set -euo pipefail

REPO_ROOT="${1:-/var/www/pump/tma}"
MIG_DIR="$REPO_ROOT/db/migrations"
STAMP_DIR="$REPO_ROOT/.deploy"
BOOTSTRAP_MARKER="$STAMP_DIR/migrations-bootstrapped"
PG_DB="${PGDATABASE:-pump_db}"

log() { echo "[migrations] $*"; }

if [[ ! -d "$MIG_DIR" ]]; then
  log "no $MIG_DIR — skip"
  exit 0
fi

psql_q() {
  sudo -u postgres psql -d "$PG_DB" -v ON_ERROR_STOP=1 -q "$@"
}

psql_t() {
  sudo -u postgres psql -d "$PG_DB" -tAc "$1" 2>/dev/null | tr -d '[:space:]'
}

if ! sudo -u postgres psql -d "$PG_DB" -c "SELECT 1" >/dev/null 2>&1; then
  log "ERROR: cannot connect to PostgreSQL database $PG_DB"
  exit 1
fi

psql_q <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum   TEXT
);
CREATE INDEX IF NOT EXISTS schema_migrations_applied_at_idx ON schema_migrations (applied_at DESC);
SQL

ledger_count="$(psql_t "SELECT COUNT(*)::text FROM schema_migrations")"
ledger_count="${ledger_count:-0}"

has_tokens="$(psql_t "SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'tokens'
)::text")"
has_launchpad="$(psql_t "SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'launchpad_tasks'
)::text")"

shopt -s nullglob
migration_files=("$MIG_DIR"/*.sql)
total_migrations="${#migration_files[@]}"

mkdir -p "$STAMP_DIR"

is_existing_prod=false
if [[ "$has_tokens" == "t" || "$has_launchpad" == "t" ]]; then
  is_existing_prod=true
fi

needs_bootstrap=false
if [[ "$is_existing_prod" == true ]]; then
  if [[ "$ledger_count" == "0" && ! -f "$BOOTSTRAP_MARKER" ]]; then
    needs_bootstrap=true
    log "existing DB + empty ledger → bootstrap"
  elif [[ "$ledger_count" -gt 0 && "$ledger_count" -lt "$total_migrations" ]]; then
    needs_bootstrap=true
    log "repair: partial ledger ($ledger_count/$total_migrations) on existing DB — mark rest applied"
  fi
fi

if [[ "$needs_bootstrap" == true ]]; then
  for f in "${migration_files[@]}"; do
    base="$(basename "$f")"
    psql_q -c "INSERT INTO schema_migrations (version) VALUES ('${base}') ON CONFLICT (version) DO NOTHING"
  done
  date -u +%Y-%m-%dT%H:%M:%SZ > "$BOOTSTRAP_MARKER"
  log "bootstrap/repair complete ($total_migrations versions in ledger) — no historical SQL re-run"
fi

applied_new=0
skipped=0

for f in "${migration_files[@]}"; do
  base="$(basename "$f")"
  already="$(psql_t "SELECT 1 FROM schema_migrations WHERE version = '${base}' LIMIT 1")"
  if [[ "$already" == "1" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  log "applying $base"
  if psql_q -f "$f"; then
    psql_q -c "INSERT INTO schema_migrations (version) VALUES ('${base}') ON CONFLICT (version) DO NOTHING"
    applied_new=$((applied_new + 1))
    log "OK $base"
  else
    log "ERROR: $base failed — deploy halted (fix SQL and re-run)"
    exit 1
  fi
done

log "done: ${applied_new} new, ${skipped} already applied"

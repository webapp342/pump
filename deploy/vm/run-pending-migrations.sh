#!/usr/bin/env bash
# Apply pending SQL migrations once (schema_migrations ledger). Safe for CI/CD every deploy.
# Usage: bash deploy/vm/run-pending-migrations.sh [/var/www/pump/tma]
#
# Existing production DB (tokens table present, empty ledger): one-time bootstrap marks
# all current migration files as applied without re-running (avoids destructive re-apply).
# New migrations (055+) apply automatically on next deploy.
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

# Ledger table (000 runs first on fresh DB; CREATE IF NOT EXISTS on existing)
if [[ -f "$MIG_DIR/000_schema_migrations.sql" ]]; then
  psql_q -f "$MIG_DIR/000_schema_migrations.sql" || true
fi
psql_q <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum   TEXT
);
SQL

ledger_count="$(psql_t "SELECT COUNT(*)::text FROM schema_migrations")"
has_tokens="$(psql_t "SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'tokens'
)::text")"

mkdir -p "$STAMP_DIR"

# One-time bootstrap for existing pump_db (already migrated outside ledger)
if [[ "${ledger_count:-0}" == "0" && "$has_tokens" == "t" && ! -f "$BOOTSTRAP_MARKER" ]]; then
  log "bootstrapping ledger for existing production DB (mark current files applied)"
  shopt -s nullglob
  for f in "$MIG_DIR"/*.sql; do
    base="$(basename "$f")"
    psql_q -c "INSERT INTO schema_migrations (version) VALUES ('${base}') ON CONFLICT (version) DO NOTHING"
  done
  date -u +%Y-%m-%dT%H:%M:%SZ > "$BOOTSTRAP_MARKER"
  log "bootstrap complete — only new migration files will run from now on"
fi

applied_new=0
skipped=0

shopt -s nullglob
for f in "$MIG_DIR"/*.sql; do
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

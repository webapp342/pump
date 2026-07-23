#!/usr/bin/env bash
# Opsiyonel chart drift teşhisi — 7-day SKIP_PG gate İPTAL (2026-07-23).
# Cron example (optional): 0 6 * * * root bash .../check-chart-parity.sh >> /var/log/pump-chart-parity.log 2>&1
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
LOG_DIR="${PUMP_PARITY_LOG_DIR:-/var/log/pump}"
STAMP="$(date -u +%Y-%m-%d)"

mkdir -p "$LOG_DIR"
cd "$TMA_DIR"

echo "=== check-chart-parity ${STAMP}T$(date -u +%H:%M:%SZ) ==="

npm run build -w @pump/indexer-sol --if-present >/dev/null 2>&1 || true
npm run check-chart-parity -w @pump/indexer-sol
EXIT=$?

if [[ "$EXIT" -eq 0 ]]; then
  echo "${STAMP} green" >> "${LOG_DIR}/chart-parity-streak.log"
else
  echo "${STAMP} FAIL exit=${EXIT}" >> "${LOG_DIR}/chart-parity-streak.log"
fi

exit "$EXIT"

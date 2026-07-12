#!/usr/bin/env bash
# Populate mv_* views (schema creates them WITH NO DATA — SELECT fails until REFRESH).
set -euo pipefail

DB="${DB:-pump_db}"

echo "[refresh-mvs] REFRESH mv_token_trade_stats + mv_token_price_anchors"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
REFRESH MATERIALIZED VIEW mv_token_trade_stats;
REFRESH MATERIALIZED VIEW mv_token_price_anchors;
SQL
echo "[refresh-mvs] done"

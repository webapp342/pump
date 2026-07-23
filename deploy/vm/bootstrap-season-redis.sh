#!/usr/bin/env bash
# F1 — Bootstrap season:current in Redis (idempotent). XP ZINCRBY works without this;
# leaderboard API returns default season id=1, but explicit meta helps ops.
set -euo pipefail

TMA_DIR="${TMA_DIR:-/var/www/pump/tma}"
WEB_ENV="${TMA_DIR}/.env"
REDIS_URL="${REDIS_URL:-}"

if [[ -z "$REDIS_URL" && -f "$WEB_ENV" ]]; then
  REDIS_URL="$(grep -E '^REDIS_URL=' "$WEB_ENV" | tail -1 | cut -d= -f2- | tr -d '"'"'"' | tr -d ' ')"
fi
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EXISTS="$(redis-cli -u "$REDIS_URL" EXISTS season:current 2>/dev/null || echo 0)"

if [[ "$EXISTS" == "1" ]]; then
  echo "[bootstrap-season] season:current already set:"
  redis-cli -u "$REDIS_URL" HGETALL season:current
  exit 0
fi

redis-cli -u "$REDIS_URL" HSET season:current id 1 started_at "$STAMP"
echo "[bootstrap-season] created season:current id=1 started_at=$STAMP"

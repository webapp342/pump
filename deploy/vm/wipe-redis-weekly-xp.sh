#!/usr/bin/env bash
# Emergency: clear weekly XP leaderboard in Redis (after admin wipe if Redis step was skipped).
set -euo pipefail

REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
hostport="${REDIS_URL#redis://}"
hostport="${hostport%%/*}"
host="${hostport%%:*}"
port="${hostport##*:}"
[[ "$host" == "$port" ]] && port=6379

log() { echo "[wipe-redis-xp] $*"; }

if ! command -v redis-cli >/dev/null 2>&1; then
  echo "redis-cli not found" >&2
  exit 1
fi

log "Deleting weekly XP keys on $host:$port"
redis-cli -h "$host" -p "$port" DEL weekly_user_xp weekly_clan_xp pump:ch:trades pump:ch:candles >/dev/null || true

for pattern in "pump:hot:*" "pump:seq:trade:*" "pump:stream:*" "clan:member:*" "weekly_user_xp_season_*" "weekly_clan_xp_season_*" "season:*:claims_open"; do
  count="$(redis-cli -h "$host" -p "$port" --scan --pattern "$pattern" | wc -l | tr -d ' ')"
  if [[ "$count" -gt 0 ]]; then
    redis-cli -h "$host" -p "$port" --scan --pattern "$pattern" | xargs -r redis-cli -h "$host" -p "$port" DEL >/dev/null || true
    log "deleted pattern $pattern (~$count keys)"
  fi
done

started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
redis-cli -h "$host" -p "$port" HSET season:current id 1 started_at "$started_at" >/dev/null
log "season:current reset to id=1"
log "done — refresh /missions Leaderboard"

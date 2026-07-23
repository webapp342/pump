/** Feature flags for phased DB performance rollout. */

function perfFlagEnabled(name: string): boolean {
  const value = process.env[name];
  if (value === "false") return false;
  if (value === "true") return true;
  return process.env.NODE_ENV === "production";
}

/** Pre-aggregated bonding_states counts (indexed columns). */
export function useBondingStateCounts(): boolean {
  return perfFlagEnabled("USE_BONDING_STATE_COUNTS");
}

/** Materialized views for trade stats + price anchors (indexer refresh). */
export function useMvTokenStats(): boolean {
  return perfFlagEnabled("USE_MV_TOKEN_STATS");
}

/** Indexer-maintained token_board_stats (phase 3 incremental reads). */
export function useTokenBoardStats(): boolean {
  return perfFlagEnabled("USE_TOKEN_BOARD_STATS");
}

/** Redis hot cache for arena board payloads. */
export function useRedisArenaCache(): boolean {
  return perfFlagEnabled("USE_REDIS_ARENA_CACHE");
}

/** Weekly XP ZSET reads (leaderboard + pre-trade cashback). */
export function useRedisWeeklyXp(): boolean {
  if (process.env.USE_REDIS_WEEKLY_XP === "false") return false;
  if (process.env.USE_REDIS_WEEKLY_XP === "true") return true;
  return Boolean(process.env.REDIS_URL?.trim());
}

/** F6 — skip PG token_candles mirror (operatör cutover; parity gate cancelled). */
export function skipPgTokenCandles(): boolean {
  return process.env.SKIP_PG_TOKEN_CANDLES === "true";
}

export function redisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url || null;
}

export function useWebSocketLive(): boolean {
  return process.env.NEXT_PUBLIC_WS_ENABLED === "true";
}

export function webSocketUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_WS_URL?.trim();
  return url || null;
}

export function walletRoom(address: string): string {
  return `wallet:${address.toLowerCase()}`;
}

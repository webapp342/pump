/** Shared Redis keys + weekly XP math (indexer + web). */
export const REDIS_KEYS = {
    weeklyUserXp: "weekly_user_xp",
    weeklyClanXp: "weekly_clan_xp",
    seasonCurrent: "season:current",
    seasonClaimsOpen: (seasonId) => `season:${seasonId}:claims_open`,
    archivedUserXp: (seasonId) => `weekly_user_xp_season_${seasonId}`,
    archivedClanXp: (seasonId) => `weekly_clan_xp_season_${seasonId}`,
    chTradesStream: "pump:ch:trades",
    chCandlesStream: "pump:ch:candles",
    nativePriceSolUsd: "price:native:sol:usd",
};
/** Max user_xp passed in buy/sell IX (anti-spoof cap). */
export const USER_XP_IX_MAX = 10_000_000;
/** Minimum weekly XP for on-chain cashback (program v2). */
export const CASHBACK_XP_THRESHOLD = 1000;
/** 1 XP per 0.01 SOL traded volume (net of protocol fee). */
export const XP_PER_SOL = 100;
export function computeTradeXp(volumeSolNet) {
    if (!Number.isFinite(volumeSolNet) || volumeSolNet <= 0)
        return 0;
    return Math.floor(volumeSolNet * XP_PER_SOL);
}
export function parseSeasonMeta(raw) {
    const id = Number.parseInt(raw?.id ?? "1", 10);
    return {
        id: Number.isFinite(id) && id > 0 ? id : 1,
        startedAt: raw?.started_at ?? new Date().toISOString(),
    };
}

/** Shared Redis keys + weekly XP math (indexer + web). */
export declare const REDIS_KEYS: {
    readonly weeklyUserXp: "weekly_user_xp";
    readonly weeklyClanXp: "weekly_clan_xp";
    readonly seasonCurrent: "season:current";
    readonly seasonClaimsOpen: (seasonId: number) => string;
    readonly archivedUserXp: (seasonId: number) => string;
    readonly archivedClanXp: (seasonId: number) => string;
    readonly chTradesStream: "pump:ch:trades";
    readonly chCandlesStream: "pump:ch:candles";
    readonly nativePriceSolUsd: "price:native:sol:usd";
};
/** Max user_xp passed in buy/sell IX (anti-spoof cap). */
export declare const USER_XP_IX_MAX = 10000000;
/** Minimum weekly XP for on-chain cashback (program v2). */
export declare const CASHBACK_XP_THRESHOLD = 1000;
/** 1 XP per 0.01 SOL traded volume (net of protocol fee). */
export declare const XP_PER_SOL = 100;
export declare function computeTradeXp(volumeSolNet: number): number;
export type SeasonMeta = {
    id: number;
    startedAt: string;
};
export declare function parseSeasonMeta(raw: Record<string, string> | null): SeasonMeta;
export { allocateClanSeasonPool, allocatePoolByXp, type ClanMemberXp, type ClanWalletAllocation, type LamportAllocation, type RankedEntry, } from "./settlement.js";

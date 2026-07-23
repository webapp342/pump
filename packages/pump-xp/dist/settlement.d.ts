/** Off-chain season pool allocation (F4). Lamports split by XP weight. */
export type RankedEntry = {
    id: string;
    xp: number;
    rank: number;
};
export type LamportAllocation = {
    id: string;
    rank: number;
    xp: number;
    lamports: bigint;
};
/** Proportional split; last entry absorbs rounding dust. */
export declare function allocatePoolByXp(entries: RankedEntry[], totalLamports: bigint): LamportAllocation[];
export type ClanMemberXp = {
    wallet: string;
    xp: number;
    role?: string;
};
export type ClanWalletAllocation = {
    wallet: string;
    lamports: bigint;
    clanId: string;
    clanRank: number;
};
/**
 * Top-3 clan pool: clans split by XP weight; within each clan leader 20%, members 80% by XP.
 */
export declare function allocateClanSeasonPool(input: {
    topClans: RankedEntry[];
    totalLamports: bigint;
    membersByClan: Map<string, ClanMemberXp[]>;
    leaderByClan: Map<string, string>;
}): ClanWalletAllocation[];

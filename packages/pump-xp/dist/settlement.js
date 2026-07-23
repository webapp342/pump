/** Off-chain season pool allocation (F4). Lamports split by XP weight. */
/** Proportional split; last entry absorbs rounding dust. */
export function allocatePoolByXp(entries, totalLamports) {
    const eligible = entries.filter((e) => e.xp > 0);
    if (eligible.length === 0 || totalLamports <= 0n)
        return [];
    const sumXp = eligible.reduce((sum, e) => sum + e.xp, 0);
    if (sumXp <= 0)
        return [];
    let allocated = 0n;
    return eligible.map((entry, index) => {
        const isLast = index === eligible.length - 1;
        const lamports = isLast
            ? totalLamports - allocated
            : (totalLamports * BigInt(entry.xp)) / BigInt(sumXp);
        if (!isLast)
            allocated += lamports;
        return {
            id: entry.id,
            rank: entry.rank,
            xp: entry.xp,
            lamports,
        };
    });
}
/**
 * Top-3 clan pool: clans split by XP weight; within each clan leader 20%, members 80% by XP.
 */
export function allocateClanSeasonPool(input) {
    const clanShares = allocatePoolByXp(input.topClans, input.totalLamports);
    const out = [];
    for (const clanShare of clanShares) {
        const leader = input.leaderByClan.get(clanShare.id)?.trim();
        const members = input.membersByClan.get(clanShare.id) ?? [];
        if (!leader || clanShare.lamports <= 0n)
            continue;
        const leaderLamports = (clanShare.lamports * 20n) / 100n;
        const memberPool = clanShare.lamports - leaderLamports;
        out.push({
            wallet: leader,
            lamports: leaderLamports,
            clanId: clanShare.id,
            clanRank: clanShare.rank,
        });
        const memberRows = members.filter((m) => m.wallet !== leader && m.xp > 0);
        const memberAlloc = allocatePoolByXp(memberRows.map((m, i) => ({
            id: m.wallet,
            xp: m.xp,
            rank: i + 1,
        })), memberPool);
        for (const row of memberAlloc) {
            out.push({
                wallet: row.id,
                lamports: row.lamports,
                clanId: clanShare.id,
                clanRank: clanShare.rank,
            });
        }
    }
    return out;
}

/** Avg-cost position accounting — mirrors src/lib/portfolio-lots.ts */
export function emptyPositionCostState() {
    return {
        tokenBalance: 0,
        totalBought: 0,
        totalSold: 0,
        remainingCostBasis: 0,
        realizedPnl: 0,
        remainingCostBasisUsd: 0,
        realizedPnlUsd: 0,
    };
}
export function tradeNetZug(grossZug, feeZug) {
    return Math.max(0, grossZug - feeZug);
}
/**
 * Apply one bonding-curve trade to position aggregates (avg-cost, resets at zero balance).
 * USD leg uses nativeUsdRate at trade time when provided (indexer snapshot).
 */
export function applyTradeToPositionCost(state, isBuy, grossZug, feeZug, tokenAmount, nativeUsdRate) {
    const netZug = tradeNetZug(grossZug, feeZug);
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0 || netZug <= 0) {
        return state;
    }
    const rate = nativeUsdRate != null && Number.isFinite(nativeUsdRate) && nativeUsdRate > 0
        ? nativeUsdRate
        : null;
    if (isBuy) {
        const netUsd = rate != null ? netZug * rate : 0;
        return {
            tokenBalance: state.tokenBalance + tokenAmount,
            totalBought: state.totalBought + grossZug,
            totalSold: state.totalSold,
            remainingCostBasis: state.remainingCostBasis + netZug,
            realizedPnl: state.realizedPnl,
            remainingCostBasisUsd: state.remainingCostBasisUsd + netUsd,
            realizedPnlUsd: state.realizedPnlUsd,
        };
    }
    const tracked = Math.max(state.tokenBalance, 0);
    const sold = Math.min(tokenAmount, tracked);
    if (sold <= 0) {
        return {
            ...state,
            tokenBalance: Math.max(0, state.tokenBalance - tokenAmount),
            totalSold: state.totalSold + grossZug,
        };
    }
    const avgCost = tracked > 0 ? state.remainingCostBasis / tracked : 0;
    const costRemoved = avgCost * sold;
    const proceeds = netZug * (sold / tokenAmount);
    const newBalance = Math.max(0, tracked - sold);
    const avgCostUsd = tracked > 0 ? state.remainingCostBasisUsd / tracked : 0;
    const costRemovedUsd = avgCostUsd * sold;
    const proceedsUsd = rate != null ? proceeds * rate : 0;
    return {
        tokenBalance: newBalance,
        totalBought: state.totalBought,
        totalSold: state.totalSold + grossZug,
        remainingCostBasis: newBalance <= 0 ? 0 : Math.max(0, state.remainingCostBasis - costRemoved),
        realizedPnl: state.realizedPnl + (proceeds - costRemoved),
        remainingCostBasisUsd: newBalance <= 0 ? 0 : Math.max(0, state.remainingCostBasisUsd - costRemovedUsd),
        realizedPnlUsd: state.realizedPnlUsd + (proceedsUsd - costRemovedUsd),
    };
}

/** Minimum ERC20 balance treated as a non-zero holding. */
export const ON_CHAIN_BALANCE_EPSILON = 1e-6;

/**
 * Prefer on-chain balance when verified; hide ghost indexer rows when on-chain is zero.
 * (After a full sell, RPC is authoritative — do not keep showing stale indexed balance.)
 */
export function resolveVerifiedTokenBalance(
  indexedBalance: number,
  onChainBalance: number | null | undefined
): { displayBalance: number; hidden: boolean; verified: boolean; pending: boolean } {
  if (onChainBalance == null || !Number.isFinite(onChainBalance)) {
    const hasIndexedHint = indexedBalance > ON_CHAIN_BALANCE_EPSILON;
    return {
      displayBalance: hasIndexedHint ? indexedBalance : 0,
      hidden: !hasIndexedHint,
      verified: false,
      pending: hasIndexedHint,
    };
  }

  if (onChainBalance <= ON_CHAIN_BALANCE_EPSILON) {
    return { displayBalance: 0, hidden: true, verified: true, pending: false };
  }

  return { displayBalance: onChainBalance, hidden: false, verified: true, pending: false };
}

type HoldingsPosition = {
  tokenAddress: string;
  tokenBalance: string;
  lastPriceBnb: string;
};

/** Sum holdings USD value using on-chain balances; skip pending or hidden rows. */
export function sumVerifiedHoldingsBnb(
  positions: HoldingsPosition[],
  onChainBalances: Record<string, string>
): number {
  return positions.reduce((sum, position) => {
    const indexedBalance = Number(position.tokenBalance);
    const onChainStr = onChainBalances[position.tokenAddress.toLowerCase()];
    const onChainBalance = onChainStr != null ? Number(onChainStr) : null;
    const { displayBalance, hidden, pending } = resolveVerifiedTokenBalance(
      indexedBalance,
      onChainBalance
    );
    if (hidden) return sum;

    const price = Number(position.lastPriceBnb);
    if (!Number.isFinite(price)) return sum;
    return sum + displayBalance * price;
  }, 0);
}

/** Scale cost basis when on-chain balance is lower than indexed balance. */
export function scaleCostBasisForBalance(
  costBasisBnb: number,
  indexedBalance: number,
  displayBalance: number
): number {
  if (!Number.isFinite(costBasisBnb) || costBasisBnb <= 0) return 0;
  if (!Number.isFinite(indexedBalance) || indexedBalance <= 0) return 0;
  if (!Number.isFinite(displayBalance) || displayBalance <= 0) return 0;
  if (displayBalance >= indexedBalance) return costBasisBnb;
  return costBasisBnb * (displayBalance / indexedBalance);
}

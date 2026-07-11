import type { TokenListItem } from "@/lib/db/launchpad";

export type PortfolioHoldingsSortKey = "amount" | "value";
export type PortfolioHoldingsSortDir = "asc" | "desc";

export function togglePortfolioHoldingsSort(
  activeKey: PortfolioHoldingsSortKey,
  activeDir: PortfolioHoldingsSortDir,
  nextKey: PortfolioHoldingsSortKey
): { key: PortfolioHoldingsSortKey; dir: PortfolioHoldingsSortDir } {
  if (activeKey !== nextKey) {
    return { key: nextKey, dir: "desc" };
  }
  return { key: nextKey, dir: activeDir === "desc" ? "asc" : "desc" };
}

export function compareNumbers(a: number, b: number, dir: PortfolioHoldingsSortDir): number {
  const delta = a - b;
  return dir === "asc" ? delta : -delta;
}

export type PortfolioHoldingRowLike = {
  estimatedValueBnb: number;
  amount: number;
};

export function sortPortfolioHoldingRows<T extends PortfolioHoldingRowLike>(
  rows: T[],
  sortKey: PortfolioHoldingsSortKey,
  sortDir: PortfolioHoldingsSortDir
): T[] {
  return [...rows].sort((a, b) => {
    const left = sortKey === "amount" ? a.amount : a.estimatedValueBnb;
    const right = sortKey === "amount" ? b.amount : b.estimatedValueBnb;
    return compareNumbers(left, right, sortDir);
  });
}

export function sortLaunchedTokens(
  tokens: TokenListItem[],
  sortKey: PortfolioHoldingsSortKey,
  sortDir: PortfolioHoldingsSortDir
): TokenListItem[] {
  return [...tokens].sort((a, b) => {
    const left =
      sortKey === "amount" ? a.holderCount : Number(a.marketCapBnb ?? 0);
    const right =
      sortKey === "amount" ? b.holderCount : Number(b.marketCapBnb ?? 0);
    return compareNumbers(left, right, sortDir);
  });
}

export function formatLaunchedAmount(holderCount: number): string {
  if (!Number.isFinite(holderCount) || holderCount <= 0) return "";
  if (holderCount >= 1_000_000) return `${(holderCount / 1_000_000).toFixed(2)}M`;
  if (holderCount >= 1_000) return `${(holderCount / 1_000).toFixed(2)}K`;
  return holderCount.toLocaleString();
}

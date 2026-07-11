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

export type LaunchedTokenRow = {
  token: TokenListItem;
  balance: number;
  valueBnb: number;
};

export function sortLaunchedTokenRows<T extends LaunchedTokenRow>(
  rows: T[],
  sortKey: PortfolioHoldingsSortKey,
  sortDir: PortfolioHoldingsSortDir
): T[] {
  return [...rows].sort((a, b) => {
    const left = sortKey === "amount" ? a.balance : a.valueBnb;
    const right = sortKey === "amount" ? b.balance : b.valueBnb;
    return compareNumbers(left, right, sortDir);
  });
}

export function formatPortfolioTokenAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

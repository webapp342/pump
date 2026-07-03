"use client";

import { bnbToUsd } from "@/lib/format-usd";

export type PortfolioAllocationItem = {
  key: string;
  symbol: string;
  valueUsd: number;
};

type PortfolioAllocationStripProps = {
  items: PortfolioAllocationItem[];
  totalValueUsd: number;
  maxItems?: number;
};

const ALLOCATION_COLORS = [
  "rgb(var(--pump-accent))",
  "rgb(var(--pump-success))",
  "rgb(var(--pump-warning))",
  "rgb(var(--pump-danger))",
] as const;

export function buildPortfolioAllocationItems(
  rows: Array<{
    key: string;
    symbol: string;
    estimatedValueBnb: number;
  }>,
  nativeBnb: number,
  nativeSymbol: string,
  bnbUsd: number | null | undefined
): PortfolioAllocationItem[] {
  const items: PortfolioAllocationItem[] = [];

  const nativeUsd = bnbToUsd(nativeBnb, bnbUsd) ?? 0;
  if (nativeUsd > 0) {
    items.push({ key: "native", symbol: nativeSymbol, valueUsd: nativeUsd });
  }

  for (const row of rows) {
    const valueUsd = bnbToUsd(row.estimatedValueBnb, bnbUsd) ?? 0;
    if (valueUsd <= 0) continue;
    items.push({ key: row.key, symbol: row.symbol, valueUsd });
  }

  return items.sort((a, b) => b.valueUsd - a.valueUsd);
}

export function PortfolioAllocationStrip({
  items,
  totalValueUsd,
  maxItems = 4,
}: PortfolioAllocationStripProps) {
  if (items.length === 0 || totalValueUsd <= 0) return null;

  const top = items.slice(0, maxItems);
  const topTotal = top.reduce((sum, item) => sum + item.valueUsd, 0);
  const denom = totalValueUsd > 0 ? totalValueUsd : topTotal;

  return (
    <div className="portfolio-allocation-strip" aria-label="Portfolio allocation">
      <div className="portfolio-allocation-strip__track">
        {top.map((item, index) => {
          const pct = denom > 0 ? (item.valueUsd / denom) * 100 : 0;
          return (
            <span key={item.key} className="portfolio-allocation-strip__chip">
              <span
                className="portfolio-allocation-strip__dot"
                style={{ background: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] }}
                aria-hidden
              />
              <span className="portfolio-allocation-strip__symbol">{item.symbol}</span>
              <span className="portfolio-allocation-strip__pct financial-value">
                {pct.toFixed(1)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

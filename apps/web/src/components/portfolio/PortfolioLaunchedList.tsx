"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PortfolioHoldingMobileCard } from "@/components/portfolio/PortfolioHoldingMobileCard";
import {
  PortfolioHoldingsGridHead,
  PortfolioHoldingsMobileHeader,
} from "@/components/portfolio/PortfolioHoldingsSortControls";
import { PnlCell } from "@/components/portfolio/PortfolioPnlCell";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import type { TokenListItem } from "@/lib/db/launchpad";
import {
  bnbToUsd,
  formatPortfolioHoldingValueUsd,
  formatUsdReadable,
} from "@/lib/format-usd";
import {
  formatPortfolioTokenAmount,
  sortLaunchedTokenRows,
  togglePortfolioHoldingsSort,
  type LaunchedTokenRow,
  type PortfolioHoldingsSortDir,
  type PortfolioHoldingsSortKey,
} from "@/lib/portfolio-holdings-sort";

export type LaunchedTokenHoldingMetrics = {
  balance: number;
  valueBnb: number;
  valueUsd: number;
  pnlUsd: number | null;
  pnlPct: number | null;
  avgEntryUsd: number | null;
};

type PortfolioLaunchedListProps = {
  tokens: TokenListItem[];
  bnbUsd: number | null;
  holdingMetricsByAddress: Record<string, LaunchedTokenHoldingMetrics>;
};

function shouldShowLaunchedPnl(valueUsd: number, pnlUsd: number | null): pnlUsd is number {
  return valueUsd > 0 && pnlUsd != null && Number.isFinite(pnlUsd);
}

function buildLaunchedRows(
  tokens: TokenListItem[],
  holdingMetricsByAddress: Record<string, LaunchedTokenHoldingMetrics>,
  bnbUsd: number | null
): Array<LaunchedTokenRow & LaunchedTokenHoldingMetrics> {
  return tokens.map((token) => {
    const metrics = holdingMetricsByAddress[token.address.toLowerCase()];
    if (metrics) {
      return {
        token,
        balance: metrics.balance,
        valueBnb: metrics.valueBnb,
        valueUsd: metrics.valueUsd,
        pnlUsd: metrics.pnlUsd,
        pnlPct: metrics.pnlPct,
        avgEntryUsd: metrics.avgEntryUsd,
      };
    }

    return {
      token,
      balance: 0,
      valueBnb: 0,
      valueUsd: bnbToUsd(0, bnbUsd) ?? 0,
      pnlUsd: null,
      pnlPct: null,
      avgEntryUsd: null,
    };
  });
}

function LaunchedDesktopRow({
  row,
}: {
  row: LaunchedTokenRow & LaunchedTokenHoldingMetrics;
}) {
  const { token } = row;
  const showPnl = shouldShowLaunchedPnl(row.valueUsd, row.pnlUsd);

  return (
    <tr>
      <td className="px-4 py-3">
        <Link
          href={`/token/${token.address}`}
          className="portfolio-holdings-grid__coin-row flex min-w-0 items-center gap-2"
        >
          <TokenAvatar
            address={token.address}
            symbol={token.symbol}
            logoUrl={token.logoUrl}
            className="portfolio-holdings-grid__coin-mark !ring-0"
          />
          <p className="portfolio-holdings-grid__coin-symbol truncate">{token.symbol}</p>
        </Link>
      </td>
      <td className="portfolio-holdings-grid__actions-cell px-4 py-3" aria-hidden />
      <td className="portfolio-holdings-grid__num portfolio-holdings-grid__data px-4 py-3 financial-value text-pump-text">
        {formatPortfolioTokenAmount(row.balance)}
      </td>
      <td className="portfolio-holdings-grid__num portfolio-holdings-grid__data portfolio-holdings-grid__value-cell px-4 py-3 financial-value text-pump-text">
        {formatPortfolioHoldingValueUsd(row.valueUsd)}
      </td>
      <td className="portfolio-holdings-grid__num portfolio-holdings-grid__data px-4 py-3 financial-value text-pump-text">
        {showPnl ? formatUsdReadable(row.avgEntryUsd, { compact: true }) : "—"}
      </td>
      <td className="portfolio-holdings-grid__num w-[1%] whitespace-nowrap px-4 py-3">
        {showPnl ? (
          <PnlCell usd={row.pnlUsd} pct={row.pnlPct} align="end" />
        ) : null}
      </td>
    </tr>
  );
}

export function PortfolioLaunchedList({
  tokens,
  bnbUsd,
  holdingMetricsByAddress,
}: PortfolioLaunchedListProps) {
  const [sortKey, setSortKey] = useState<PortfolioHoldingsSortKey>("value");
  const [sortDir, setSortDir] = useState<PortfolioHoldingsSortDir>("desc");

  function onSort(column: PortfolioHoldingsSortKey) {
    const next = togglePortfolioHoldingsSort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  const launchedRows = useMemo(
    () => buildLaunchedRows(tokens, holdingMetricsByAddress, bnbUsd),
    [tokens, holdingMetricsByAddress, bnbUsd]
  );

  const sortedRows = useMemo(
    () => sortLaunchedTokenRows(launchedRows, sortKey, sortDir),
    [launchedRows, sortKey, sortDir]
  );

  return (
    <>
      <div className="lg:hidden portfolio-holdings-mobile">
        <PortfolioHoldingsMobileHeader sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <div className="portfolio-holdings-mobile__body">
          {sortedRows.map((row) => {
            const showPnl = shouldShowLaunchedPnl(row.valueUsd, row.pnlUsd);

            return (
              <PortfolioHoldingMobileCard
                key={row.token.address}
                logo={
                  <TokenAvatar
                    address={row.token.address}
                    symbol={row.token.symbol}
                    logoUrl={row.token.logoUrl}
                  />
                }
                title={
                  <Link href={`/token/${row.token.address}`} className="truncate">
                    {row.token.symbol}
                  </Link>
                }
                amount={formatPortfolioTokenAmount(row.balance)}
                valueUsd={row.valueUsd}
                pnlUsd={showPnl ? row.pnlUsd : null}
              />
            );
          })}
        </div>
      </div>

      <div className="hidden lg:block overflow-x-auto">
        <table className="sheet-grid portfolio-holdings-grid">
          <colgroup>
            <col className="portfolio-holdings-grid__col-coin" />
            <col className="portfolio-holdings-grid__col-actions" />
            <col className="portfolio-holdings-grid__col-amount" />
            <col className="portfolio-holdings-grid__col-value" />
            <col className="portfolio-holdings-grid__col-entry" />
            <col className="portfolio-holdings-grid__col-pnl" />
          </colgroup>
          <thead>
            <PortfolioHoldingsGridHead sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <LaunchedDesktopRow key={row.token.address} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

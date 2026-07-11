"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PortfolioHoldingMobileCard } from "@/components/portfolio/PortfolioHoldingMobileCard";
import {
  PortfolioHoldingsGridHead,
  PortfolioHoldingsMobileHeader,
} from "@/components/portfolio/PortfolioHoldingsSortControls";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { PctChange } from "@/components/ui/PctChange";
import type { TokenListItem } from "@/lib/db/launchpad";
import { bnbToUsd, formatPortfolioHoldingValueUsd } from "@/lib/format-usd";
import {
  formatLaunchedAmount,
  sortLaunchedTokens,
  togglePortfolioHoldingsSort,
  type PortfolioHoldingsSortDir,
  type PortfolioHoldingsSortKey,
} from "@/lib/portfolio-holdings-sort";

type PortfolioLaunchedListProps = {
  tokens: TokenListItem[];
  bnbUsd: number | null;
};

function LaunchedDesktopRow({
  token,
  bnbUsd,
}: {
  token: TokenListItem;
  bnbUsd: number | null;
}) {
  const mcapUsd = bnbToUsd(Number(token.marketCapBnb), bnbUsd);
  const amountLabel = formatLaunchedAmount(token.holderCount);
  const change24h = token.change24hPct ?? null;
  const showChange = change24h != null && Number.isFinite(change24h);

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
        {amountLabel}
      </td>
      <td className="portfolio-holdings-grid__num portfolio-holdings-grid__data portfolio-holdings-grid__value-cell px-4 py-3 financial-value text-pump-text">
        {formatPortfolioHoldingValueUsd(mcapUsd)}
      </td>
      <td className="portfolio-holdings-grid__num portfolio-holdings-grid__data px-4 py-3 financial-value text-pump-muted" />
      <td className="portfolio-holdings-grid__num w-[1%] whitespace-nowrap px-4 py-3">
        {showChange ? (
          <PctChange value={change24h} className="text-caption font-medium" hideWhenEmpty />
        ) : null}
      </td>
    </tr>
  );
}

export function PortfolioLaunchedList({ tokens, bnbUsd }: PortfolioLaunchedListProps) {
  const [sortKey, setSortKey] = useState<PortfolioHoldingsSortKey>("value");
  const [sortDir, setSortDir] = useState<PortfolioHoldingsSortDir>("desc");

  function onSort(column: PortfolioHoldingsSortKey) {
    const next = togglePortfolioHoldingsSort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  const sortedTokens = useMemo(
    () => sortLaunchedTokens(tokens, sortKey, sortDir),
    [tokens, sortKey, sortDir]
  );

  return (
    <>
      <div className="lg:hidden portfolio-holdings-mobile">
        <PortfolioHoldingsMobileHeader sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <div className="portfolio-holdings-mobile__body">
          {sortedTokens.map((token) => {
            const mcapUsd = bnbToUsd(Number(token.marketCapBnb), bnbUsd);
            const amountLabel = formatLaunchedAmount(token.holderCount);
            const change24h = token.change24hPct ?? null;
            const showChange = change24h != null && Number.isFinite(change24h);

            return (
              <PortfolioHoldingMobileCard
                key={token.address}
                logo={
                  <TokenAvatar
                    address={token.address}
                    symbol={token.symbol}
                    logoUrl={token.logoUrl}
                  />
                }
                title={
                  <Link href={`/token/${token.address}`} className="truncate">
                    {token.symbol}
                  </Link>
                }
                amount={amountLabel}
                valueUsd={mcapUsd}
                pnlSlot={
                  showChange ? (
                    <PctChange
                      value={change24h}
                      className="portfolio-holding-mobile__value-pnl"
                      hideWhenEmpty
                    />
                  ) : undefined
                }
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
            {sortedTokens.map((token) => (
              <LaunchedDesktopRow key={token.address} token={token} bnbUsd={bnbUsd} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

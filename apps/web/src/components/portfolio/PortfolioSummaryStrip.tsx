"use client";

import { PctChange } from "@/components/ui/PctChange";
import { NativeLogo } from "@/components/token/NativeLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import {
  formatPortfolioHoldingValueUsd,
  formatUsdSignedTwoDecimals,
} from "@/lib/format-usd";
import type { TopHoldingSummary } from "@/lib/portfolio-summary";

type PortfolioSummaryStripProps = {
  totalValueUsd: number | null;
  totalNetPnlUsd: number;
  totalNetPnlPct: number | null;
  topHolding: TopHoldingSummary | null;
  coinsHeld: number;
  valueFlashClass?: string;
  guestMode?: boolean;
};

function pnlTone(value: number): string {
  if (value > 0) return "portfolio-summary-strip__pnl--up";
  if (value < 0) return "portfolio-summary-strip__pnl--down";
  return "portfolio-summary-strip__pnl--flat";
}

function PnlInline({
  usd,
  pct,
}: {
  usd: number;
  pct: number | null;
}) {
  return (
    <span className={`portfolio-summary-strip__pnl ${pnlTone(usd)}`}>
      <span className="financial-value">{formatUsdSignedTwoDecimals(usd)}</span>
      {pct != null ? (
        <>
          <span className="portfolio-summary-strip__pnl-sep" aria-hidden>
            ·
          </span>
          <PctChange value={pct} className="portfolio-summary-strip__pct" />
        </>
      ) : null}
    </span>
  );
}

function ValueWithPnl({
  valueUsd,
  pnlUsd,
  pnlPct,
  valueFlashClass = "",
  guestMode = false,
}: {
  valueUsd: number | null;
  pnlUsd?: number;
  pnlPct?: number | null;
  valueFlashClass?: string;
  guestMode?: boolean;
}) {
  if (guestMode || valueUsd == null) {
    return <span className="portfolio-summary-strip__amount">—</span>;
  }

  const showPnl = pnlUsd != null;

  return (
    <span className="portfolio-summary-strip__value-stack">
      <span
        className={`portfolio-summary-strip__amount financial-value ${valueFlashClass}`.trim()}
      >
        {formatPortfolioHoldingValueUsd(valueUsd)}
      </span>
      {showPnl ? <PnlInline usd={pnlUsd} pct={pnlPct ?? null} /> : null}
    </span>
  );
}

function HoldingChip({ holding }: { holding: TopHoldingSummary }) {
  return (
    <span className="portfolio-summary-strip__holding-chip">
      {holding.isNative ? (
        <NativeLogo size={14} className="portfolio-summary-strip__holding-chip-logo" />
      ) : holding.tokenAddress ? (
        <TokenAvatar
          address={holding.tokenAddress}
          symbol={holding.symbol}
          logoUrl={holding.logoUrl}
          size={14}
          shape="rounded"
          className="portfolio-summary-strip__holding-chip-logo !ring-0"
        />
      ) : null}
      <span className="portfolio-summary-strip__holding-chip-symbol">
        {holding.symbol}
      </span>
    </span>
  );
}

export function PortfolioSummaryStrip({
  totalValueUsd,
  totalNetPnlUsd,
  totalNetPnlPct,
  topHolding,
  coinsHeld,
  valueFlashClass = "",
  guestMode = false,
}: PortfolioSummaryStripProps) {
  const showTopPnl =
    topHolding != null &&
    !topHolding.isNative &&
    topHolding.pnlUsd != null;

  return (
    <section className="portfolio-summary-strip portfolio-summary-strip--desktop hidden md:grid" aria-label="Portfolio summary">
      <div className="portfolio-summary-strip__cell">
        <p className="portfolio-summary-strip__label">Total Value</p>
        <p className="portfolio-summary-strip__metric-row">
          {guestMode ? (
            <span className="portfolio-summary-strip__amount">—</span>
          ) : (
            <ValueWithPnl
              valueUsd={totalValueUsd}
              pnlUsd={totalNetPnlUsd}
              pnlPct={totalNetPnlPct}
              valueFlashClass={valueFlashClass}
            />
          )}
        </p>
      </div>

      <div className="portfolio-summary-strip__cell">
        <p className="portfolio-summary-strip__label">Top Holding</p>
        {topHolding ? (
          <p className="portfolio-summary-strip__metric-row">
            <span className="portfolio-summary-strip__value-stack">
              <span className="portfolio-summary-strip__amount-row">
                {guestMode || topHolding.valueUsd == null ? (
                  <span className="portfolio-summary-strip__amount">—</span>
                ) : (
                  <span className="portfolio-summary-strip__amount financial-value">
                    {formatPortfolioHoldingValueUsd(topHolding.valueUsd)}
                  </span>
                )}
                <HoldingChip holding={topHolding} />
              </span>
              {showTopPnl ? (
                <PnlInline usd={topHolding.pnlUsd!} pct={topHolding.pnlPct} />
              ) : null}
            </span>
            {topHolding.isNative ? (
              <span className="portfolio-summary-strip__meta">Native balance</span>
            ) : null}
          </p>
        ) : (
          <p className="portfolio-summary-strip__metric-row">
            <span className="portfolio-summary-strip__amount">—</span>
          </p>
        )}
      </div>

      <div className="portfolio-summary-strip__cell portfolio-summary-strip__cell--coins">
        <p className="portfolio-summary-strip__label">Coins</p>
        <p className="portfolio-summary-strip__metric-row">
          <span className="portfolio-summary-strip__amount">
            {guestMode ? "—" : coinsHeld.toLocaleString()}
          </span>
          {!guestMode ? (
            <span className="portfolio-summary-strip__meta">held</span>
          ) : null}
        </p>
      </div>
    </section>
  );
}

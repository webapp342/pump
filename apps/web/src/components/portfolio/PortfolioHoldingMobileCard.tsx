"use client";

import type { ReactNode } from "react";
import {
  formatPortfolioHoldingValueUsd,
  formatUsdSignedTwoDecimals,
} from "@/lib/format-usd";

type PortfolioHoldingMobileCardProps = {
  logo: ReactNode;
  title: ReactNode;
  amount: ReactNode;
  valueUsd: number | null;
  pnlUsd?: number | null;
  pnlSlot?: ReactNode;
  valueFlashClass?: string;
  /** Optional action under the title (e.g. Launch spotlight Pin). */
  action?: ReactNode;
};

function pnlTone(value: number): string {
  if (value > 0) return "text-pump-success";
  if (value < 0) return "text-pump-danger";
  return "text-pump-muted";
}

export function PortfolioHoldingMobileCard({
  logo,
  title,
  amount,
  valueUsd,
  pnlUsd,
  pnlSlot,
  valueFlashClass = "",
  action,
}: PortfolioHoldingMobileCardProps) {
  const showPnlUsd =
    pnlUsd != null &&
    Number.isFinite(pnlUsd) &&
    valueUsd != null &&
    Number.isFinite(valueUsd) &&
    valueUsd > 0;
  const showPnlSlot = pnlSlot != null;

  return (
    <article className="portfolio-holding-mobile">
      <div className="portfolio-holding-mobile__coin">
        {logo}
        <div className="portfolio-holding-mobile__title-stack">
          <div className="portfolio-holding-mobile__title">{title}</div>
          {action ? <div className="portfolio-holding-mobile__action">{action}</div> : null}
        </div>
      </div>
      <div className="portfolio-holding-mobile__amount financial-value">{amount}</div>
      <div className="portfolio-holding-mobile__value financial-value">
        <span className={`portfolio-holding-mobile__value-main ${valueFlashClass}`.trim()}>
          {formatPortfolioHoldingValueUsd(valueUsd)}
        </span>
        {showPnlUsd ? (
          <span className={`portfolio-holding-mobile__value-pnl ${pnlTone(pnlUsd)}`}>
            {formatUsdSignedTwoDecimals(pnlUsd)}
          </span>
        ) : showPnlSlot ? (
          pnlSlot
        ) : null}
      </div>
    </article>
  );
}

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
  valueFlashClass?: string;
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
  valueFlashClass = "",
}: PortfolioHoldingMobileCardProps) {
  const showPnl = pnlUsd != null && Number.isFinite(pnlUsd);

  return (
    <article className="portfolio-holding-mobile">
      <div className="portfolio-holding-mobile__coin">
        {logo}
        <div className="portfolio-holding-mobile__title">{title}</div>
      </div>
      <div className="portfolio-holding-mobile__amount financial-value">{amount}</div>
      <div className="portfolio-holding-mobile__value financial-value">
        <span className={`portfolio-holding-mobile__value-main ${valueFlashClass}`.trim()}>
          {formatPortfolioHoldingValueUsd(valueUsd)}
        </span>
        {showPnl ? (
          <span className={`portfolio-holding-mobile__value-pnl ${pnlTone(pnlUsd)}`}>
            {formatUsdSignedTwoDecimals(pnlUsd)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

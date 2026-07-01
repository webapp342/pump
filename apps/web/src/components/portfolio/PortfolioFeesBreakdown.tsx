"use client";

import { formatPortfolioFeesUsd } from "@/lib/format-usd";

type PortfolioFeesBreakdownProps = {
  availableBnb: number;
  claimedBnb: number;
  bnbUsd: number | null;
};

export function PortfolioFeesBreakdown({
  availableBnb,
  claimedBnb,
  bnbUsd,
}: PortfolioFeesBreakdownProps) {
  return (
    <dl className="portfolio-fees-breakdown">
      <div className="portfolio-fees-breakdown__item">
        <dt className="portfolio-fees-breakdown__label">Available</dt>
        <dd className="portfolio-fees-breakdown__value financial-value">
          {formatPortfolioFeesUsd(availableBnb, bnbUsd)}
        </dd>
      </div>
      <div className="portfolio-fees-breakdown__item">
        <dt className="portfolio-fees-breakdown__label">Claimed</dt>
        <dd className="portfolio-fees-breakdown__value financial-value text-pump-muted">
          {formatPortfolioFeesUsd(claimedBnb, bnbUsd)}
        </dd>
      </div>
    </dl>
  );
}

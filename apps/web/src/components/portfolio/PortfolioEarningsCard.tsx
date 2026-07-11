"use client";

import type { ReactNode } from "react";
import { formatPortfolioFeesUsd } from "@/lib/format-usd";

type PortfolioEarningsCardProps = {
  title: string;
  description: string;
  availableBnb: number;
  claimedBnb: number;
  bnbUsd: number | null;
  onClaim: () => void;
  claimLabel?: string;
  secondaryAction?: ReactNode;
  className?: string;
};

export function PortfolioEarningsCard({
  title,
  description,
  availableBnb,
  claimedBnb,
  bnbUsd,
  onClaim,
  claimLabel = "Claim",
  secondaryAction,
  className = "",
}: PortfolioEarningsCardProps) {
  const canClaim = availableBnb > 0;

  return (
    <article className={`portfolio-earnings-card ${className}`.trim()}>
      <div className="portfolio-earnings-card__head">
        <h3 className="portfolio-earnings-card__title">{title}</h3>
        <p className="portfolio-earnings-card__desc">{description}</p>
      </div>

      <dl className="portfolio-earnings-card__metrics">
        <div className="portfolio-earnings-card__metric portfolio-earnings-card__metric--primary">
          <dt className="portfolio-earnings-card__metric-label">Available</dt>
          <dd className="portfolio-earnings-card__metric-value financial-value">
            {formatPortfolioFeesUsd(availableBnb, bnbUsd)}
          </dd>
        </div>
        <div className="portfolio-earnings-card__metric">
          <dt className="portfolio-earnings-card__metric-label">Claimed</dt>
          <dd className="portfolio-earnings-card__metric-value financial-value text-pump-muted">
            {formatPortfolioFeesUsd(claimedBnb, bnbUsd)}
          </dd>
        </div>
      </dl>

      <div
        className={`portfolio-earnings-card__actions${
          secondaryAction ? " portfolio-earnings-card__actions--split" : ""
        }`}
      >
        {secondaryAction}
        <button
          type="button"
          onClick={onClaim}
          className={canClaim ? "primary-button" : "secondary-button"}
        >
          {claimLabel}
        </button>
      </div>
    </article>
  );
}

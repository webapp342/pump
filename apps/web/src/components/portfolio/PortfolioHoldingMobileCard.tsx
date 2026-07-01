"use client";

import type { ReactNode } from "react";

type PortfolioHoldingMobileCardProps = {
  logo: ReactNode;
  title: ReactNode;
  amount: ReactNode;
  value: ReactNode;
};

export function PortfolioHoldingMobileCard({
  logo,
  title,
  amount,
  value,
}: PortfolioHoldingMobileCardProps) {
  return (
    <article className="portfolio-holding-mobile">
      <div className="portfolio-holding-mobile__coin">
        {logo}
        <div className="portfolio-holding-mobile__title">{title}</div>
      </div>
      <div className="portfolio-holding-mobile__amount financial-value">{amount}</div>
      <div className="portfolio-holding-mobile__value financial-value">{value}</div>
    </article>
  );
}

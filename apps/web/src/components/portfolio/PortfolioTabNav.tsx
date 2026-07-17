"use client";

import Link from "next/link";
import { PORTFOLIO_TABS, PORTFOLIO_TAB_LABELS, portfolioTabHref } from "@/lib/portfolio-tabs";
import type { PortfolioTab } from "@/lib/portfolio-tabs";

type PortfolioTabNavProps = {
  active: PortfolioTab;
  feesPending?: boolean;
};

export function PortfolioTabNav({
  active,
  feesPending = false,
}: PortfolioTabNavProps) {
  return (
    <nav className="portfolio-tab-nav" aria-label="Portfolio sections">
      <div className="portfolio-tab-nav__track" role="tablist">
        {PORTFOLIO_TABS.map((tab) => {
          const isActive = tab === active;
          const showDot = tab === "fees" && feesPending && !isActive;

          return (
            <Link
              key={tab}
              href={portfolioTabHref(tab)}
              scroll={false}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "portfolio-tab-nav__item portfolio-tab-nav__item--active"
                  : "portfolio-tab-nav__item"
              }
            >
              <span className="portfolio-tab-nav__label">{PORTFOLIO_TAB_LABELS[tab]}</span>
              {showDot ? (
                <span className="portfolio-tab-nav__dot" aria-label="Claimable earnings" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

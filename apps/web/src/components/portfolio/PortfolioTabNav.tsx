"use client";

import Link from "next/link";
import type { PortfolioTab } from "@/lib/portfolio-tabs";
import { PORTFOLIO_TAB_LABELS, portfolioTabHref } from "@/lib/portfolio-tabs";

type PortfolioTabNavProps = {
  active: PortfolioTab;
  counts?: Partial<Record<PortfolioTab, number>>;
  rewardsPending?: boolean;
};

export function PortfolioTabNav({
  active,
  counts = {},
  rewardsPending = false,
}: PortfolioTabNavProps) {
  const tabs: PortfolioTab[] = ["holdings", "launched", "rewards"];

  return (
    <nav className="portfolio-tab-nav" aria-label="Portfolio sections">
      {tabs.map((tab) => {
        const isActive = tab === active;
        const count = counts[tab];
        const showDot = tab === "rewards" && rewardsPending && !isActive;

        return (
          <Link
            key={tab}
            href={portfolioTabHref(tab)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "portfolio-tab-nav__item portfolio-tab-nav__item--active"
                : "portfolio-tab-nav__item"
            }
          >
            <span className="portfolio-tab-nav__label">{PORTFOLIO_TAB_LABELS[tab]}</span>
            {count != null && count > 0 ? (
              <span className="portfolio-tab-nav__count financial-value">{count}</span>
            ) : null}
            {showDot ? (
              <span className="portfolio-tab-nav__dot" aria-label="Claimable rewards" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

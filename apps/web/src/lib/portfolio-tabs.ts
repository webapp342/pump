export const PORTFOLIO_TABS = ["holdings", "launched", "rewards"] as const;

export type PortfolioTab = (typeof PORTFOLIO_TABS)[number];

export function parsePortfolioTab(value: string | null | undefined): PortfolioTab {
  if (value === "launched" || value === "rewards") return value;
  return "holdings";
}

export function portfolioTabHref(tab: PortfolioTab): string {
  if (tab === "holdings") return "/portfolio";
  return `/portfolio?tab=${tab}`;
}

export const PORTFOLIO_TAB_LABELS: Record<PortfolioTab, string> = {
  holdings: "Holdings",
  launched: "Launched",
  rewards: "Rewards",
};

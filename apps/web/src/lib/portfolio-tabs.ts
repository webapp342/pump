export const PORTFOLIO_TABS = [
  "holdings",
  "launched",
  "callouts",
  "fees",
  "airdrops",
] as const;

export type PortfolioTab = (typeof PORTFOLIO_TABS)[number];

export function parsePortfolioTab(value: string | null | undefined): PortfolioTab {
  if (value === "earnings" || value === "rewards") return "fees";
  if (
    value === "launched" ||
    value === "callouts" ||
    value === "fees" ||
    value === "airdrops"
  ) {
    return value;
  }
  return "holdings";
}

export function portfolioTabHref(tab: PortfolioTab): string {
  if (tab === "holdings") return "/portfolio";
  const slug = tab === "fees" ? "earnings" : tab;
  return `/portfolio?tab=${slug}`;
}

export const PORTFOLIO_TAB_LABELS: Record<PortfolioTab, string> = {
  holdings: "Holdings",
  launched: "Launched",
  callouts: "Callouts",
  fees: "Earnings",
  airdrops: "Airdrops",
};

/** User-facing card titles on the Earnings tab (sentence case — not fee jargon). */
export const PORTFOLIO_EARNINGS_CARD_LABELS = {
  creator: "Creator earnings",
  referral: "Referral earnings",
} as const;

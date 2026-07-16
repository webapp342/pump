import { REWARDS_TABS } from "@/lib/rewards-copy";

export type PointsHubTab = "earn" | "market" | "leaderboard";

export type PointsMarketView = "shop" | "inventory";

export const POINTS_HUB_TABS: { id: PointsHubTab; label: string }[] = [
  { id: "earn", label: REWARDS_TABS.earn },
  { id: "market", label: REWARDS_TABS.market },
  { id: "leaderboard", label: REWARDS_TABS.leaderboard },
];

export function parsePointsHubTab(value: string | null | undefined): PointsHubTab {
  if (value === "market" || value === "earn" || value === "leaderboard") {
    return value;
  }
  if (value === "overview" || value === "levels") return "earn";
  if (value === "activity") return "market";
  return "earn";
}

export function parsePointsMarketView(value: string | null | undefined): PointsMarketView {
  if (value === "inventory") return "inventory";
  return "shop";
}

export function pointsHubHref(tab: PointsHubTab, marketView?: PointsMarketView): string {
  if (tab === "earn") return "/missions";
  if (tab === "market" && marketView === "inventory") {
    return "/missions?tab=market&market=inventory";
  }
  return `/missions?tab=${tab}`;
}

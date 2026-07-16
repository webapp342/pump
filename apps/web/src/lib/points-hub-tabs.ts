export type PointsHubTab = "overview" | "earn" | "levels" | "market" | "activity";

export const POINTS_HUB_TABS: { id: PointsHubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "earn", label: "Earn" },
  { id: "levels", label: "Levels" },
  { id: "market", label: "Market" },
  { id: "activity", label: "Activity" },
];

export function parsePointsHubTab(value: string | null | undefined): PointsHubTab {
  if (
    value === "earn" ||
    value === "levels" ||
    value === "market" ||
    value === "overview" ||
    value === "activity"
  ) {
    return value;
  }
  return "overview";
}

export function pointsHubHref(tab: PointsHubTab): string {
  return tab === "overview" ? "/missions" : `/missions?tab=${tab}`;
}

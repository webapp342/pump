export const TOKEN_MOBILE_STATS_EXPANDED_KEY = "pump-token-mobile-stats-expanded";

export function readTokenMobileStatsExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(TOKEN_MOBILE_STATS_EXPANDED_KEY);
    if (stored === null) return true;
    return stored === "1";
  } catch {
    return true;
  }
}

export function writeTokenMobileStatsExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(TOKEN_MOBILE_STATS_EXPANDED_KEY, expanded ? "1" : "0");
  } catch {
    /* quota / private mode */
  }
}

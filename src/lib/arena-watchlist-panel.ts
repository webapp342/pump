export const WATCHLIST_PANEL_STORAGE_KEY = "pump-watchlist-panel-collapsed";

export function readWatchlistPanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(WATCHLIST_PANEL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeWatchlistPanelCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(WATCHLIST_PANEL_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore storage errors.
  }
}

export type ArenaViewMode = "board" | "cards";

export const ARENA_VIEW_STORAGE_KEY = "pump-arena-view";

export function readArenaViewMode(): ArenaViewMode {
  if (typeof window === "undefined") return "board";
  try {
    const stored = localStorage.getItem(ARENA_VIEW_STORAGE_KEY);
    return stored === "cards" ? "cards" : "board";
  } catch {
    return "board";
  }
}

export function writeArenaViewMode(mode: ArenaViewMode): void {
  try {
    localStorage.setItem(ARENA_VIEW_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors.
  }
}

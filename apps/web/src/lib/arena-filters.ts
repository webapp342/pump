export type BoardFilter =
  | "all"
  | "new"
  | "movers"
  | "favorites"
  | "hasAirdrop";

export const ARENA_FILTER_STORAGE_KEY = "pump-arena-filters";

const FILTER_VALUES: BoardFilter[] = [
  "all",
  "new",
  "movers",
  "favorites",
  "hasAirdrop",
];

export function readArenaFilter(): BoardFilter {
  if (typeof window === "undefined") return "new";
  try {
    const stored = localStorage.getItem(ARENA_FILTER_STORAGE_KEY);
    if (stored === "highVol" || stored === "kothContenders") return "new";
    if (stored && FILTER_VALUES.includes(stored as BoardFilter)) {
      return stored as BoardFilter;
    }
  } catch {
    // Ignore storage errors.
  }
  return "new";
}

export function writeArenaFilter(filter: BoardFilter): void {
  try {
    localStorage.setItem(ARENA_FILTER_STORAGE_KEY, filter);
  } catch {
    // Ignore storage errors.
  }
}

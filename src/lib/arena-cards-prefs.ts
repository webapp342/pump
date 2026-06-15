export type ArenaCardsSortKey = "mcap" | "vol24h" | "h24";

export type ArenaCardsDensity = "comfortable" | "compact";

export const ARENA_CARDS_SORT_STORAGE_KEY = "pump-arena-cards-sort";
export const ARENA_CARDS_DENSITY_STORAGE_KEY = "pump-arena-cards-density";

const SORT_KEYS: ArenaCardsSortKey[] = ["mcap", "vol24h", "h24"];

export function readArenaCardsSort(): ArenaCardsSortKey {
  if (typeof window === "undefined") return "mcap";
  try {
    const stored = localStorage.getItem(ARENA_CARDS_SORT_STORAGE_KEY);
    return SORT_KEYS.includes(stored as ArenaCardsSortKey)
      ? (stored as ArenaCardsSortKey)
      : "mcap";
  } catch {
    return "mcap";
  }
}

export function writeArenaCardsSort(sort: ArenaCardsSortKey): void {
  try {
    localStorage.setItem(ARENA_CARDS_SORT_STORAGE_KEY, sort);
  } catch {
    // Ignore storage errors.
  }
}

export function readArenaCardsDensity(): ArenaCardsDensity {
  if (typeof window === "undefined") return "comfortable";
  try {
    return localStorage.getItem(ARENA_CARDS_DENSITY_STORAGE_KEY) === "compact"
      ? "compact"
      : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function writeArenaCardsDensity(density: ArenaCardsDensity): void {
  try {
    localStorage.setItem(ARENA_CARDS_DENSITY_STORAGE_KEY, density);
  } catch {
    // Ignore storage errors.
  }
}

export const ARENA_CARDS_SORT_LABELS: Record<ArenaCardsSortKey, string> = {
  mcap: "Market cap",
  vol24h: "24h volume",
  h24: "24h change",
};

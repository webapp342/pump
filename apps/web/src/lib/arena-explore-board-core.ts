import type { ArenaCardsSortKey } from "@/lib/arena-cards-prefs";
import type { BoardFilter } from "@/lib/arena-filters";
import type { ArenaFilterCounts, KothSummary, TokenListItem } from "@/lib/db/launchpad";

export const SIDEBAR_FILTER_ITEMS = [
  ["favorites", null],
  ["new", "New"],
  ["all", "All"],
  ["movers", "Movers"],
  ["hasAirdrop", "Has airdrop"],
  ["kothContenders", "KOTH"],
] as const satisfies ReadonlyArray<readonly [BoardFilter, string | null]>;

export const SERVER_BOARD_FILTERS = new Set<BoardFilter>([
  "movers",
  "kothContenders",
  "hasAirdrop",
]);

export const KOTH_CONTENDER_RANK = 5;
export const ARENA_BOARD_PAGE_INITIAL = 50;
export const ARENA_BOARD_PAGE_INCREMENT = 25;

export type FlashTone = "up" | "down";
export type BoardSortKey =
  | "mcap"
  | "ath"
  | "age"
  | "txns"
  | "vol24h"
  | "traders"
  | "h1"
  | "h6"
  | "h24";
export type BoardSortDir = "asc" | "desc";

export type BoardCacheEntry = {
  tokens: TokenListItem[];
  topByMcap: TokenListItem[];
  koth: KothSummary | null;
  hasMore: boolean;
  serverFilterCounts: ArenaFilterCounts | null;
};

export function boardCacheKey(
  filter: BoardFilter,
  sortKey: string,
  sortDir: string,
  airdropKey: string
): string {
  return `${filter}:${sortKey}:${sortDir}:${airdropKey}`;
}

export function apiBoardFilter(activeFilter: BoardFilter): BoardFilter {
  return activeFilter === "favorites" ? "all" : activeFilter;
}

export function applyBoardFilterDefaults(filter: BoardFilter): {
  sortKey?: BoardSortKey;
  sortDir?: BoardSortDir;
  cardsSort?: ArenaCardsSortKey;
} {
  if (filter === "all") {
    return { sortKey: "mcap", sortDir: "desc", cardsSort: "mcap" };
  }
  if (filter === "new") {
    return { sortKey: "age", sortDir: "desc" };
  }
  if (filter === "movers") {
    return { sortKey: "h24", sortDir: "desc", cardsSort: "h24" };
  }
  return {};
}

export function emptyExploreFilterCopy(
  filter: BoardFilter,
  options: {
    search: string;
    isConnected: boolean;
    favoritesCount: number;
    favoriteListLoaded: boolean;
  }
): string {
  if (options.search.trim()) {
    return "No coins match your search.";
  }

  switch (filter) {
    case "favorites":
      if (!options.isConnected) return "Connect wallet to sync starred tokens.";
      if (options.favoritesCount === 0) {
        return "Star tokens in Explore coins to add them here.";
      }
      if (!options.favoriteListLoaded) return "Loading favorites…";
      return "No favorites to show.";
    case "movers":
      return "No movers with 1%+ 24h change right now.";
    case "kothContenders":
      return "No KOTH contenders yet.";
    case "hasAirdrop":
      return "No coins with an active airdrop right now.";
    default:
      return "No coins match this filter.";
  }
}

export function matchesBoardFilter(
  token: TokenListItem,
  filter: BoardFilter,
  favorites: Set<string>,
  kothContenderAddresses: Set<string>,
  airdropTokenAddresses: Set<string>
): boolean {
  if (filter === "new") {
    return true;
  }
  if (filter === "movers") {
    return Math.abs(token.change24hPct ?? 0) >= 1;
  }
  if (filter === "kothContenders") {
    return kothContenderAddresses.has(token.address.toLowerCase());
  }
  if (filter === "favorites") {
    return favorites.has(token.address.toLowerCase());
  }
  if (filter === "hasAirdrop") {
    return airdropTokenAddresses.has(token.address.toLowerCase());
  }
  return true;
}

export function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

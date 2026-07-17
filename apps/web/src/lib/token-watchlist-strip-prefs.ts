import type { BoardFilter } from "@/lib/arena-filters";
import type { PumpIconDefinition } from "@/lib/icons";
import {
  faArrowTrendUp,
  faAirdropParachute,
  faCircleDollarSign,
  faRocket,
  faSparkles,
} from "@/lib/pump-icons";

export type TokenWatchlistStripIcon = PumpIconDefinition | "watchlist";

export type TokenWatchlistStripMode = "auto" | BoardFilter;

export const TOKEN_WATCHLIST_STRIP_PREFS_KEY = "pump-token-watchlist-strip-mode";

const STRIP_MODE_VALUES: TokenWatchlistStripMode[] = [
  "auto",
  "favorites",
  "all",
  "new",
  "movers",
  "hasAirdrop",
];

export function readTokenWatchlistStripMode(): TokenWatchlistStripMode {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = localStorage.getItem(TOKEN_WATCHLIST_STRIP_PREFS_KEY);
    if (stored === "kothContenders") return "all";
    if (stored && STRIP_MODE_VALUES.includes(stored as TokenWatchlistStripMode)) {
      return stored as TokenWatchlistStripMode;
    }
  } catch {
    // Ignore storage errors.
  }
  return "auto";
}

export function writeTokenWatchlistStripMode(mode: TokenWatchlistStripMode): void {
  try {
    localStorage.setItem(TOKEN_WATCHLIST_STRIP_PREFS_KEY, mode);
  } catch {
    // Ignore storage errors.
  }
}

export function resolveTokenWatchlistStripFilter(
  mode: TokenWatchlistStripMode,
  hasWatchlist: boolean
): BoardFilter {
  if (mode === "auto") {
    return hasWatchlist ? "favorites" : "all";
  }
  return mode;
}

export function tokenWatchlistStripLabel(filter: BoardFilter): string {
  switch (filter) {
    case "favorites":
      return "Watchlist";
    case "all":
      return "Top MC";
    case "new":
      return "New";
    case "movers":
      return "Movers";
    case "hasAirdrop":
      return "Airdrop";
    default:
      return "Watchlist";
  }
}

export function tokenWatchlistStripIcon(filter: BoardFilter): TokenWatchlistStripIcon {
  switch (filter) {
    case "favorites":
      return "watchlist";
    case "all":
      return faCircleDollarSign;
    case "new":
      return faRocket;
    case "movers":
      return faArrowTrendUp;
    case "hasAirdrop":
      return faAirdropParachute;
    default:
      return faCircleDollarSign;
  }
}

export function tokenWatchlistStripModeIcon(mode: TokenWatchlistStripMode): TokenWatchlistStripIcon {
  if (mode === "auto") return faSparkles;
  if (mode === "favorites") return "watchlist";
  return tokenWatchlistStripIcon(mode);
}

export const TOKEN_WATCHLIST_STRIP_SOURCE_OPTIONS: {
  key: TokenWatchlistStripMode;
  label: string;
  description: string;
}[] = [
  {
    key: "auto",
    label: "Auto",
    description: "Watchlist when starred, otherwise Top MC",
  },
  {
    key: "favorites",
    label: "Watchlist",
    description: "Tokens you have starred",
  },
  {
    key: "all",
    label: "Top MC",
    description: "Highest market cap from All",
  },
  {
    key: "new",
    label: "New",
    description: "Recently launched tokens",
  },
  {
    key: "movers",
    label: "Movers",
    description: "Largest 24h price moves",
  },
  {
    key: "hasAirdrop",
    label: "Airdrop",
    description: "Tokens with active airdrops",
  },
];

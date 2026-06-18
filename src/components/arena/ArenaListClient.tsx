"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LayoutGrid, Table2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAccount } from "wagmi";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import type { ArenaFilterCounts, KothSummary, TokenListItem } from "@/lib/db/launchpad";
import { ArenaSkeleton } from "@/components/arena/ArenaSkeleton";
import { SkeletonBoardTable } from "@/components/ui/skeleton-parts";
import { ArenaMcapTicker } from "@/components/arena/ArenaMcapTicker";
import { ArenaShortcutsModal } from "@/components/arena/ArenaShortcutsModal";
import { ArenaTokenCard } from "@/components/arena/ArenaTokenCard";
import { ArenaWatchlistSheet } from "@/components/arena/ArenaWatchlistSheet";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import { IconLabel, SectionHeadingIcon, TableHeaderLabel } from "@/components/ui/IconLabel";
import { ICON_STROKE } from "@/lib/icons";
import { MetricIcons } from "@/lib/metric-icons";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TradeSheet } from "@/components/token/TradeSheet";
import { ArenaBoardRowQuickActions } from "@/components/arena/ArenaBoardRowQuickActions";
import { ArenaExploreCoinRow } from "@/components/arena/ArenaExploreCoinRow";
import { ArenaSwipeTradeBar } from "@/components/arena/ArenaSwipeTradeBar";
import { HoldingSwipeRow } from "@/components/portfolio/HoldingSwipeRow";
import { buildArenaQuickTradePrefill } from "@/lib/arena-quick-trade";
import type { TradePrefillConfig } from "@/lib/token-trade-prefill";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import { PctChange } from "@/components/ui/PctChange";
import {
  formatAge,
  formatCapForBoard,
  listTokenPriceUsd,
} from "@/lib/arena-board-format";
import { ScrollStripTrack } from "@/components/ui/ScrollStripTrack";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";
import { useRafMessageQueue } from "@/hooks/useRafMessageQueue";
import { useLiveBoardAnimations } from "@/hooks/useLiveBoardAnimations";
import { RECENT_STRIP_DESKTOP, RECENT_STRIP_MOBILE } from "@/lib/recent-strip-limits";
import {
  readArenaViewMode,
  writeArenaViewMode,
  type ArenaViewMode,
} from "@/lib/arena-view";
import {
  ARENA_CARDS_SORT_LABELS,
  readArenaCardsDensity,
  readArenaCardsSort,
  writeArenaCardsDensity,
  writeArenaCardsSort,
  type ArenaCardsDensity,
  type ArenaCardsSortKey,
} from "@/lib/arena-cards-prefs";
import {
  readArenaFilter,
  writeArenaFilter,
  type BoardFilter,
} from "@/lib/arena-filters";
import type { ArenaTradeWsPayload } from "@/lib/arena-live-delta";
import { patchArenaTokenList } from "@/lib/arena-live-delta";
import type { AirdropListItem } from "@/lib/db/airdrops";
import type { ArenaHomePayload } from "@/lib/arena-server";

const ARENA_FILTER_ITEMS = [
  ["new", "New", "Newest"],
  ["all", "All", "All"],
  ["movers", "Movers", "Movers"],
  ["hasAirdrop", "Airdrop", "Has airdrop"],
  ["kothContenders", "KOTH", "KOTH contenders"],
  ["favorites", "Favorites", "Favorites"],
] as const;

const SERVER_BOARD_FILTERS = new Set<BoardFilter>([
  "movers",
  "kothContenders",
  "hasAirdrop",
]);

type BoardCacheEntry = {
  tokens: TokenListItem[];
  topByMcap: TokenListItem[];
  koth: KothSummary | null;
  hasMore: boolean;
  serverFilterCounts: ArenaFilterCounts | null;
};

function boardCacheKey(
  filter: BoardFilter,
  sortKey: string,
  sortDir: string,
  airdropKey: string
): string {
  return `${filter}:${sortKey}:${sortDir}:${airdropKey}`;
}

function apiBoardFilter(activeFilter: BoardFilter): BoardFilter {
  return activeFilter === "favorites" ? "all" : activeFilter;
}

function applyBoardFilterDefaults(filter: BoardFilter): {
  sortKey?: SortKey;
  sortDir?: SortDir;
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

function emptyExploreFilterCopy(
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

function ArenaFilterChips({
  activeFilter,
  filterCounts,
  onSelect,
}: {
  activeFilter: BoardFilter;
  filterCounts: Record<string, number>;
  onSelect: (filter: BoardFilter) => void;
}) {
  return (
    <>
      {ARENA_FILTER_ITEMS.map(([key, mobileLabel, desktopLabel]) => {
        const count = filterCounts[key] ?? 0;
        const isFavorites = key === "favorites";
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeFilter === key}
            onClick={() => onSelect(key)}
            className={`arena-filter-chip ${
              activeFilter === key ? "arena-filter-chip-active" : ""
            }`}
          >
            {isFavorites ? (
              <>
                <span className="inline-flex items-center gap-1 md:hidden">
                  <span className="text-lg leading-none">★</span>
                  <span>({count})</span>
                </span>
                <span className="hidden md:inline">
                  {desktopLabel} ({count})
                </span>
              </>
            ) : (
              <>
                <span className="md:hidden">
                  {mobileLabel} ({count})
                </span>
                <span className="hidden md:inline">
                  {desktopLabel} ({count})
                </span>
              </>
            )}
          </button>
        );
      })}
    </>
  );
}

type FlashTone = "up" | "down";
type SortKey = "mcap" | "ath" | "age" | "txns" | "vol24h" | "traders" | "h1" | "h6" | "h24";
type SortDir = "asc" | "desc";

function HighlightStatCard({
  href,
  label,
  token,
  icon,
}: {
  href: string;
  label: string;
  token: TokenListItem;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="panel-interactive flex min-w-0 flex-row flex-nowrap items-center justify-between gap-3 p-2.5 md:px-3 md:py-3"
    >
      <IconLabel
        icon={icon}
        className="section-label min-w-0 shrink text-caption md:text-[inherit]"
        iconClassName="h-3 w-3 shrink-0 opacity-75 md:h-3.5 md:w-3.5"
      >
        {label}
      </IconLabel>
      <div className="flex shrink-0 items-center gap-1.5">
        <TokenAvatar
          address={token.address}
          symbol={token.symbol}
          logoUrl={token.logoUrl}
          size={22}
          className="md:hidden"
        />
        <TokenAvatar
          address={token.address}
          symbol={token.symbol}
          logoUrl={token.logoUrl}
          size={18}
          className="hidden md:block"
        />
        <p className="truncate text-caption font-medium text-pump-text">{token.symbol}</p>
        <PctChange
          value={token.change24hPct ?? null}
          className="shrink-0 text-caption font-semibold leading-none"
        />
      </div>
    </Link>
  );
}

function HighlightStatPlaceholder({ label, icon }: { label: string; icon: LucideIcon }) {
  return (
    <div className="panel-surface flex min-w-0 flex-row flex-nowrap items-center justify-between gap-3 p-2.5 md:px-3 md:py-3">
      <IconLabel
        icon={icon}
        className="section-label min-w-0 shrink text-caption md:text-[inherit]"
        iconClassName="h-3 w-3 shrink-0 opacity-75 md:h-3.5 md:w-3.5"
      >
        {label}
      </IconLabel>
      <p className="shrink-0 text-body-sm text-pump-muted">—</p>
    </div>
  );
}

function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

function formatKothDurationShort(iso: string | null): string | null {
  if (!iso) return null;
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const min = Math.floor(elapsed / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatCount(value: number | null | undefined): string {
  const n = value ?? 0;
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return String(n);
}

const KOTH_CONTENDER_RANK = 5;
const ARENA_PAGE_INITIAL = 50;
const ARENA_PAGE_INCREMENT = 25;

function sortTokensForCards(
  tokens: TokenListItem[],
  sortKey: ArenaCardsSortKey
): TokenListItem[] {
  const sorted = [...tokens];
  sorted.sort((a, b) => {
    if (sortKey === "mcap") {
      return Number(b.marketCapBnb) - Number(a.marketCapBnb);
    }
    if (sortKey === "vol24h") {
      return Number(b.volume24hBnb ?? 0) - Number(a.volume24hBnb ?? 0);
    }
    if (sortKey === "h24") {
      return (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity);
    }
    return Number(b.marketCapBnb) - Number(a.marketCapBnb);
  });
  return sorted;
}

function matchesBoardFilter(
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

type ArenaQuickTradeTarget = {
  tokenAddress: `0x${string}`;
  symbol: string;
  status: string;
  prefill: TradePrefillConfig;
};

export function ArenaListClient({
  initialPayload = null,
}: {
  initialPayload?: ArenaHomePayload | null;
}) {
  const initialBoardKey = initialPayload
    ? boardCacheKey("new", "age", "desc", "")
    : "";
  const filterCacheRef = useRef(new Map<string, BoardCacheEntry>());
  const [tokens, setTokens] = useState<TokenListItem[] | null>(initialPayload?.data ?? null);
  const [loadedBoardKey, setLoadedBoardKey] = useState(initialBoardKey);
  const [topByMcap, setTopByMcap] = useState<TokenListItem[]>(initialPayload?.topByMcap ?? []);
  const [kothSummary, setKothSummary] = useState<KothSummary | null>(initialPayload?.koth ?? null);
  const [serverFilterCounts, setServerFilterCounts] = useState<ArenaFilterCounts | null>(
    initialPayload?.meta?.filterCounts ?? null
  );
  const [hasMore, setHasMore] = useState(initialPayload?.meta?.hasMore ?? false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [boardRefreshing, setBoardRefreshing] = useState(false);
  const [apiBnbUsd, setApiBnbUsd] = useState<number | null>(initialPayload?.bnbUsd ?? null);
  const [airdropTokenAddresses, setAirdropTokenAddresses] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [flashes, setFlashes] = useState<Record<string, FlashTone>>({});
  const [animatedCaps, setAnimatedCaps] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<BoardFilter>("new");
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ArenaViewMode>("board");
  const [cardsSort, setCardsSort] = useState<ArenaCardsSortKey>("mcap");
  const [cardsDensity, setCardsDensity] = useState<ArenaCardsDensity>("comfortable");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [quickTradeTarget, setQuickTradeTarget] = useState<ArenaQuickTradeTarget | null>(null);
  const [favoriteListTokens, setFavoriteListTokens] = useState<TokenListItem[]>([]);
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const { openConnectModal } = useOpenConnectModal();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { bnbUsd: hookBnbUsd } = useBnbUsdPrice();
  const effectiveBnbUsd = apiBnbUsd ?? hookBnbUsd;
  const effectiveBnbUsdRef = useRef(effectiveBnbUsd);
  effectiveBnbUsdRef.current = effectiveBnbUsd;
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const capAnimFrameRef = useRef<Record<string, number>>({});
  const animatedCapsRef = useRef<Record<string, number>>({});
  const tokensRef = useRef<TokenListItem[] | null>(initialPayload?.data ?? null);
  const initialPayloadRef = useRef(initialPayload);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const listLimitRef = useRef(ARENA_PAGE_INITIAL);
  const apiSortKey: SortKey =
    activeFilter === "movers" ? "h24" : viewMode === "cards" ? cardsSort : sortKey;
  const apiSortDir: SortDir =
    activeFilter === "movers"
      ? sortDir
      : viewMode === "cards"
        ? "desc"
        : sortDir;
  const headerSortKey: SortKey = activeFilter === "movers" ? "h24" : sortKey;
  const useServerBoardOrder = activeFilter !== "favorites";
  const favoriteAddressKey = useMemo(() => [...favorites].sort().join("|"), [favorites]);

  const loadFavoriteTokens = useCallback(async () => {
    if (!address || favorites.size === 0) {
      setFavoriteListTokens([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/favorites?address=${encodeURIComponent(address)}&include=tokens`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as {
        tokens?: TokenListItem[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load favorites");
      }
      setFavoriteListTokens(body.tokens ?? []);
    } catch {
      setFavoriteListTokens([]);
    }
  }, [address, favorites.size, favoriteAddressKey]);

  useEffect(() => {
    void loadFavoriteTokens();
  }, [loadFavoriteTokens]);

  const openQuickTrade = useCallback(
    (tokenAddress: string, symbol: string, status: string, side: "buy" | "sell") => {
      if (!isConnected) {
        openConnectModal?.();
        return;
      }
      setQuickTradeTarget({
        tokenAddress: tokenAddress.toLowerCase() as `0x${string}`,
        symbol,
        status,
        prefill: buildArenaQuickTradePrefill(side),
      });
    },
    [isConnected, openConnectModal]
  );

  const openTokenDetail = useCallback(
    (tokenAddress: string) => {
      router.push(`/token/${tokenAddress.toLowerCase()}`);
    },
    [router]
  );

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/airdrops", { cache: "no-store" });
        const body = (await response.json()) as { data?: AirdropListItem[] };
        if (!response.ok || !body.data) return;

        const addresses = new Set<string>();
        for (const airdrop of body.data) {
          if (airdrop.status !== "ACTIVE") continue;
          addresses.add(airdrop.linkedToken.toLowerCase());
          if (airdrop.rewardToken) {
            addresses.add(airdrop.rewardToken.toLowerCase());
          }
        }
        setAirdropTokenAddresses(addresses);
      } catch {
        // Keep empty set on failure.
      }
    })();
  }, []);

  const setArenaView = useCallback((mode: ArenaViewMode) => {
    setViewMode(mode);
    writeArenaViewMode(mode);
  }, []);

  const handleViewToggleClick = useCallback(
    (mode: ArenaViewMode) => {
      setArenaView(mode);
      searchInputRef.current?.blur();
    },
    [setArenaView]
  );

  useEffect(() => {
    const filter = readArenaFilter();
    setViewMode(readArenaViewMode());
    setCardsDensity(readArenaCardsDensity());
    setActiveFilter(filter);
    const defaults = applyBoardFilterDefaults(filter);
    if (defaults.sortKey) setSortKey(defaults.sortKey);
    if (defaults.sortDir) setSortDir(defaults.sortDir);
    if (defaults.cardsSort) {
      setCardsSort(defaults.cardsSort);
    } else {
      setCardsSort(readArenaCardsSort());
    }
  }, []);

  const setArenaFilter = useCallback((filter: BoardFilter) => {
    setActiveFilter(filter);
    writeArenaFilter(filter);
    const defaults = applyBoardFilterDefaults(filter);
    if (defaults.sortKey) setSortKey(defaults.sortKey);
    if (defaults.sortDir) setSortDir(defaults.sortDir);
    if (defaults.cardsSort) {
      setCardsSort(defaults.cardsSort);
      writeArenaCardsSort(defaults.cardsSort);
    }
  }, []);

  const setCardsSortPreference = useCallback((sort: ArenaCardsSortKey) => {
    setCardsSort(sort);
    writeArenaCardsSort(sort);
  }, []);

  const setCardsDensityPreference = useCallback((density: ArenaCardsDensity) => {
    setCardsDensity(density);
    writeArenaCardsDensity(density);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!window.matchMedia("(min-width: 768px)").matches) return;

      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (
        event.key === "/" &&
        !inField &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (
        event.key === "?" &&
        !inField &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const triggerFlash = useCallback((key: string, toneValue: FlashTone) => {
    setFlashes((prev) => ({ ...prev, [key]: toneValue }));
    const existing = flashTimersRef.current[key];
    if (existing) clearTimeout(existing);
    flashTimersRef.current[key] = setTimeout(() => {
      setFlashes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete flashTimersRef.current[key];
    }, 1000);
  }, []);

  const setAnimatedCap = useCallback((key: string, value: number) => {
    animatedCapsRef.current[key] = value;
    setAnimatedCaps((prev) => ({ ...prev, [key]: value }));
  }, []);

  const animateCap = useCallback(
    (key: string, to: number) => {
      const from = animatedCapsRef.current[key];
      if (from == null || !Number.isFinite(from) || !Number.isFinite(to)) {
        setAnimatedCap(key, to);
        return;
      }
      if (Math.abs(to - from) < 1e-9) return;

      const existing = capAnimFrameRef.current[key];
      if (existing) cancelAnimationFrame(existing);

      const startedAt = performance.now();
      const duration = 1000;
      const step = (now: number) => {
        const p = Math.min(1, (now - startedAt) / duration);
        const next = from + (to - from) * p;
        setAnimatedCap(key, next);
        if (p < 1) {
          capAnimFrameRef.current[key] = requestAnimationFrame(step);
        } else {
          delete capAnimFrameRef.current[key];
        }
      };
      capAnimFrameRef.current[key] = requestAnimationFrame(step);
    },
    [setAnimatedCap]
  );

  /** WS trade: snap caps instantly — no 1s tween (avoids dip-then-rise with silent poll). */
  const snapAnimatedCapsForToken = useCallback(
    (token: TokenListItem) => {
      const address = token.address.toLowerCase();
      const bnbUsd = effectiveBnbUsdRef.current;
      const snap = (suffix: string, value: number | null | undefined) => {
        if (value == null || !Number.isFinite(value)) return;
        const key = `${address}:cap:${suffix}`;
        const frame = capAnimFrameRef.current[key];
        if (frame) {
          cancelAnimationFrame(frame);
          delete capAnimFrameRef.current[key];
        }
        setAnimatedCap(key, value);
      };
      snap("mcap", bnbToUsd(Number(token.marketCapBnb), bnbUsd));
      snap(
        "ath",
        bnbToUsd(Number(token.athMarketCapBnb ?? token.marketCapBnb), bnbUsd)
      );
      snap("price", listTokenPriceUsd(token.marketCapBnb, bnbUsd));
    },
    [setAnimatedCap]
  );

  const getComparableValues = useCallback((token: TokenListItem) => {
    return {
      mcap: Number(token.marketCapBnb),
      ath: Number(token.athMarketCapBnb ?? token.marketCapBnb),
      txns: token.tradeCount ?? 0,
      vol24h: Number(token.volume24hBnb ?? 0),
      traders: token.traders24h ?? 0,
      h1: token.change1hPct ?? null,
      h6: token.change6hPct ?? null,
      h24: token.change24hPct ?? null,
    } as const;
  }, []);

  const buildTokensUrl = useCallback(
    (limit: number) => {
      const params = new URLSearchParams({
        limit: String(limit),
        sortKey: apiSortKey,
        sortDir: apiSortDir,
        filter: activeFilter === "favorites" ? "all" : activeFilter,
      });
      if (activeFilter === "hasAirdrop" && airdropTokenAddresses.size > 0) {
        params.set("airdrop", [...airdropTokenAddresses].join(","));
      }
      return `/api/tokens?${params.toString()}`;
    },
    [apiSortKey, apiSortDir, activeFilter, airdropTokenAddresses]
  );

  const airdropFilterKey =
    activeFilter === "hasAirdrop" ? [...airdropTokenAddresses].sort().join("|") : "";

  const currentBoardKey = boardCacheKey(
    apiBoardFilter(activeFilter),
    apiSortKey,
    apiSortDir,
    airdropFilterKey
  );
  const currentBoardKeyRef = useRef(currentBoardKey);
  currentBoardKeyRef.current = currentBoardKey;
  const boardDataReady =
    activeFilter === "favorites" || loadedBoardKey === currentBoardKey;

  useEffect(() => {
    if (!initialPayload || filterCacheRef.current.has(initialBoardKey)) return;
    filterCacheRef.current.set(initialBoardKey, {
      tokens: initialPayload.data,
      topByMcap: initialPayload.topByMcap,
      koth: initialPayload.koth,
      hasMore: initialPayload.meta.hasMore,
      serverFilterCounts: initialPayload.meta.filterCounts,
    });
  }, [initialPayload, initialBoardKey]);

  const load = useCallback(
    async (
      limit = listLimitRef.current,
      options: { silent?: boolean; boardKey?: string } = {}
    ) => {
      const requestBoardKey = options.boardKey ?? currentBoardKey;
      const hadData = tokensRef.current !== null;
      if (!options.silent && hadData) {
        setBoardRefreshing(true);
      }
      try {
        const response = await fetch(buildTokensUrl(limit), { cache: "no-store" });
        const body = (await response.json()) as {
          data?: TokenListItem[];
          topByMcap?: TokenListItem[];
          koth?: KothSummary | null;
          meta?: {
            total: number;
            limit: number;
            hasMore: boolean;
            filterCounts: ArenaFilterCounts;
          };
          bnbUsd?: number | null;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(body.error ?? "Failed to load tokens");
        }

        if (requestBoardKey !== currentBoardKeyRef.current) {
          return;
        }

        const nextTokens = body.data ?? [];
        setTopByMcap(body.topByMcap ?? []);
        setKothSummary(body.koth ?? null);
        setServerFilterCounts(body.meta?.filterCounts ?? null);
        setHasMore(body.meta?.hasMore ?? false);
        if (body.bnbUsd != null && Number.isFinite(body.bnbUsd) && body.bnbUsd > 0) {
          setApiBnbUsd(body.bnbUsd);
        }
        setTokens((prev) => {
          if (!prev) return nextTokens;
          const prevByAddress = new Map(prev.map((t) => [t.address.toLowerCase(), t]));
          for (const token of nextTokens) {
            const oldToken = prevByAddress.get(token.address.toLowerCase());
            if (!oldToken) continue;

            const prevValues = getComparableValues(oldToken);
            const nextValues = getComparableValues(token);
            const entries = Object.entries(nextValues) as Array<
              [keyof typeof nextValues, number | null]
            >;

            for (const [field, nextValue] of entries) {
              if (field === "h1" || field === "h6" || field === "h24") continue;
              const prevValue = prevValues[field];
              if (nextValue == null || prevValue == null) continue;
              if (!Number.isFinite(nextValue) || !Number.isFinite(prevValue)) continue;
              if (nextValue === prevValue) continue;
              triggerFlash(
                `${token.address.toLowerCase()}:${String(field)}`,
                nextValue > prevValue ? "up" : "down"
              );
            }
          }
          return nextTokens;
        });
        filterCacheRef.current.set(requestBoardKey, {
          tokens: nextTokens,
          topByMcap: body.topByMcap ?? [],
          koth: body.koth ?? null,
          hasMore: body.meta?.hasMore ?? false,
          serverFilterCounts: body.meta?.filterCounts ?? null,
        });
        setLoadedBoardKey(requestBoardKey);
        setError(null);
      } catch (err) {
        if (!hadData) {
          setTokens(null);
          setError(err instanceof Error ? err.message : "Failed to load tokens");
        }
      } finally {
        setBoardRefreshing(false);
      }
    },
    [buildTokensUrl, getComparableValues, triggerFlash, currentBoardKey]
  );

  tokensRef.current = tokens;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const nextLimit = listLimitRef.current + ARENA_PAGE_INCREMENT;
    listLimitRef.current = nextLimit;
    setLoadingMore(true);
    try {
      await load(nextLimit);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, load, loadingMore]);

  const loadRef = useRef(load);
  loadRef.current = load;
  const loadMoreRefFn = useRef(loadMore);
  loadMoreRefFn.current = loadMore;

  const loadFavoriteTokensRef = useRef(loadFavoriteTokens);
  loadFavoriteTokensRef.current = loadFavoriteTokens;

  const lastArenaWsSeqRef = useRef(0);

  const applyArenaWsMessages = useCallback(
    (messages: unknown[]) => {
      for (const message of messages) {
        const payload = message as ArenaTradeWsPayload & { type?: string; seq?: number };
        if (payload.seq != null && payload.seq <= lastArenaWsSeqRef.current) continue;
        if (payload.seq != null) lastArenaWsSeqRef.current = payload.seq;

        if (payload.type === "trade" && payload.tokenAddress && tokensRef.current) {
          const { next, changed } = patchArenaTokenList(tokensRef.current, payload);
          if (changed) {
            const addr = payload.tokenAddress.toLowerCase();
            const oldToken = tokensRef.current.find((t) => t.address.toLowerCase() === addr);
            const newToken = next.find((t) => t.address.toLowerCase() === addr);
            if (oldToken && newToken) {
              const prevMcap = Number(oldToken.marketCapBnb);
              const nextMcap = Number(newToken.marketCapBnb);
              if (Number.isFinite(prevMcap) && Number.isFinite(nextMcap) && prevMcap !== nextMcap) {
                triggerFlash(`${addr}:mcap`, nextMcap > prevMcap ? "up" : "down");
              }
              snapAnimatedCapsForToken(newToken);
            }
            setTokens(next);
            setTopByMcap((prev) => {
              const { next: patchedTop, changed: topChanged } = patchArenaTokenList(prev, payload);
              return topChanged ? patchedTop : prev;
            });
          }
          continue;
        }

        if (payload.type === "koth") {
          void loadRef.current(listLimitRef.current, { silent: true });
          continue;
        }

        if (payload.type === "board_delta") {
          void loadRef.current(listLimitRef.current, { silent: true });
          void loadFavoriteTokensRef.current();
        }
      }
    },
    [triggerFlash, snapAnimatedCapsForToken]
  );

  const queueArenaWsMessage = useRafMessageQueue(applyArenaWsMessages);

  const { connected: wsConnected } = useLiveChannel({
    room: "arena",
    onMessage: (message) => {
      queueArenaWsMessage(message);
    },
  });

  useEffect(() => {
    if (activeFilter === "favorites") {
      setHasMore(false);
      setLoadingMore(false);
      setLoadedBoardKey("favorites");
      return;
    }

    listLimitRef.current = ARENA_PAGE_INITIAL;
    setHasMore(false);
    setLoadingMore(false);

    const key = currentBoardKey;
    const cached = filterCacheRef.current.get(key);

    const ssrDefaultsMatch =
      initialPayloadRef.current != null &&
      activeFilter === "new" &&
      apiSortKey === "age" &&
      apiSortDir === "desc";

    if (cached) {
      setTokens(cached.tokens);
      setTopByMcap(cached.topByMcap);
      setKothSummary(cached.koth);
      setHasMore(cached.hasMore);
      if (cached.serverFilterCounts) {
        setServerFilterCounts(cached.serverFilterCounts);
      }
      setLoadedBoardKey(key);
      void loadRef.current(ARENA_PAGE_INITIAL, { silent: true, boardKey: key });
      return;
    }

    setBoardRefreshing(true);
    setLoadedBoardKey("");

    if (ssrDefaultsMatch) {
      initialPayloadRef.current = null;
      void loadRef.current(ARENA_PAGE_INITIAL, { silent: true, boardKey: key });
      return;
    }

    initialPayloadRef.current = null;
    void loadRef.current(ARENA_PAGE_INITIAL, { silent: true, boardKey: key });
  }, [apiSortKey, apiSortDir, activeFilter, airdropFilterKey, viewMode, currentBoardKey]);

  useEffect(() => {
    if (activeFilter === "favorites" || !hasMore || loadingMore) return;

    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreRefFn.current();
        }
      },
      { rootMargin: "240px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeFilter, hasMore, loadingMore, tokens?.length, viewMode]);

  useEffect(() => {
    if (tokens === null) return;

    let timer: number | null = null;

    const schedule = () => {
      const delay = resolveLivePollDelay(wsConnected, false);
      timer = window.setTimeout(() => {
        void loadRef.current(listLimitRef.current, { silent: true }).finally(schedule);
      }, delay);
    };

    schedule();

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [tokens, wsConnected]);

  useEffect(() => {
    return () => {
      const timers = Object.values(flashTimersRef.current);
      for (const t of timers) clearTimeout(t);
      flashTimersRef.current = {};
      const frames = Object.values(capAnimFrameRef.current);
      for (const frame of frames) cancelAnimationFrame(frame);
      capAnimFrameRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!tokens) return;

    for (const token of tokens) {
      const address = token.address.toLowerCase();
      const mcapTarget = bnbToUsd(Number(token.marketCapBnb), effectiveBnbUsd);
      const athTarget = bnbToUsd(Number(token.athMarketCapBnb ?? token.marketCapBnb), effectiveBnbUsd);
      const vol24hTarget = bnbToUsd(Number(token.volume24hBnb ?? 0), effectiveBnbUsd);

      if (mcapTarget != null && Number.isFinite(mcapTarget)) {
        const key = `${address}:cap:mcap`;
        if (animatedCapsRef.current[key] == null) setAnimatedCap(key, mcapTarget);
        else animateCap(key, mcapTarget);
      }
      if (athTarget != null && Number.isFinite(athTarget)) {
        const key = `${address}:cap:ath`;
        if (animatedCapsRef.current[key] == null) setAnimatedCap(key, athTarget);
        else animateCap(key, athTarget);
      }
      if (vol24hTarget != null && Number.isFinite(vol24hTarget)) {
        const key = `${address}:cap:vol24h`;
        if (animatedCapsRef.current[key] == null) setAnimatedCap(key, vol24hTarget);
        else animateCap(key, vol24hTarget);
      }

      const priceTarget = listTokenPriceUsd(token.marketCapBnb, effectiveBnbUsd);
      if (priceTarget != null && Number.isFinite(priceTarget)) {
        const key = `${address}:cap:price`;
        if (animatedCapsRef.current[key] == null) setAnimatedCap(key, priceTarget);
        else animateCap(key, priceTarget);
      }
    }
  }, [tokens, effectiveBnbUsd, animateCap, setAnimatedCap]);

  const resolvedTokens = tokens ?? [];
  const arenaTokenPool = useMemo(() => {
    const byAddress = new Map<string, TokenListItem>();
    for (const token of topByMcap) {
      byAddress.set(token.address.toLowerCase(), token);
    }
    for (const token of resolvedTokens) {
      byAddress.set(token.address.toLowerCase(), token);
    }
    for (const token of favoriteListTokens) {
      byAddress.set(token.address.toLowerCase(), token);
    }
    return [...byAddress.values()];
  }, [topByMcap, resolvedTokens, favoriteListTokens]);
  const mcapRankedTokens = useMemo(
    () =>
      topByMcap.length > 0
        ? topByMcap
        : [...resolvedTokens].sort(
            (a, b) => Number(b.marketCapBnb ?? 0) - Number(a.marketCapBnb ?? 0)
          ),
    [topByMcap, resolvedTokens]
  );
  const kothToken = useMemo(() => {
    const active = kothSummary?.activeTokenAddress?.toLowerCase();
    if (active) {
      const fromList =
        topByMcap.find((token) => token.address.toLowerCase() === active) ??
        resolvedTokens.find((token) => token.address.toLowerCase() === active);
      if (fromList) return fromList;
    }
    return mcapRankedTokens[0] ?? null;
  }, [kothSummary?.activeTokenAddress, mcapRankedTokens, resolvedTokens, topByMcap]);
  const kothContenderAddresses = useMemo(
    () =>
      new Set(
        mcapRankedTokens
          .slice(0, KOTH_CONTENDER_RANK)
          .map((token) => token.address.toLowerCase())
      ),
    [mcapRankedTokens]
  );
  const kothCrownedAt = useMemo(() => {
    if (!kothToken) return null;
    const addr = kothToken.address.toLowerCase();
    const active = kothSummary?.activeTokenAddress?.toLowerCase();
    if (active === addr && kothSummary?.crownedAt) {
      return kothSummary.crownedAt;
    }
    const openReign = kothSummary?.recent?.find(
      (item) => item.tokenAddress.toLowerCase() === addr && !item.dethronedAt
    );
    return openReign?.crownedAt ?? null;
  }, [kothSummary, kothToken]);
  const kothReignDuration = useMemo(
    () => formatKothDurationShort(kothCrownedAt),
    [kothCrownedAt]
  );

  const highlightPool = useMemo(() => {
    const byAddress = new Map<string, TokenListItem>();
    for (const token of topByMcap) {
      byAddress.set(token.address.toLowerCase(), token);
    }
    for (const token of resolvedTokens) {
      byAddress.set(token.address.toLowerCase(), token);
    }
    return [...byAddress.values()];
  }, [topByMcap, resolvedTokens]);

  const topGainer24h = useMemo(
    () =>
      [...highlightPool]
        .filter((t) => t.change24hPct != null)
        .sort((a, b) => (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity))[0] ?? null,
    [highlightPool]
  );
  const topVolume24h = useMemo(
    () =>
      [...highlightPool].sort(
        (a, b) => Number(b.volume24hBnb ?? 0) - Number(a.volume24hBnb ?? 0)
      )[0] ?? null,
    [highlightPool]
  );
  const mostTrades = useMemo(
    () =>
      [...highlightPool].sort((a, b) => (b.tradeCount ?? 0) - (a.tradeCount ?? 0))[0] ?? null,
    [highlightPool]
  );

  const marketTokens = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const sourceTokens = activeFilter === "favorites" ? favoriteListTokens : resolvedTokens;

    const filtered = sourceTokens.filter((token) => {
      if (
        searchTerm &&
        !token.name.toLowerCase().includes(searchTerm) &&
        !token.symbol.toLowerCase().includes(searchTerm)
      ) {
        return false;
      }
      if (activeFilter === "favorites") {
        return favorites.has(token.address.toLowerCase());
      }
      if (SERVER_BOARD_FILTERS.has(activeFilter)) {
        return true;
      }
      return matchesBoardFilter(
        token,
        activeFilter,
        favorites,
        kothContenderAddresses,
        airdropTokenAddresses
      );
    });

    if (useServerBoardOrder) {
      return filtered;
    }

    const withMetrics = filtered.map((token) => {
      const mcapUsd = bnbToUsd(Number(token.marketCapBnb), effectiveBnbUsd) ?? 0;
      const athUsd = bnbToUsd(Number(token.athMarketCapBnb ?? token.marketCapBnb), effectiveBnbUsd) ?? 0;
      const volUsd = bnbToUsd(Number(token.volume24hBnb ?? 0), effectiveBnbUsd) ?? 0;
      return {
        token,
        metric: {
          mcap: mcapUsd,
          ath: athUsd,
          age: new Date(token.createdAt).getTime(),
          txns: token.tradeCount ?? 0,
          vol24h: volUsd,
          traders: token.traders24h ?? 0,
          h1: token.change1hPct ?? 0,
          h6: token.change6hPct ?? 0,
          h24: token.change24hPct ?? 0,
        },
      };
    });

    withMetrics.sort((a, b) => {
      const av = a.metric[sortKey];
      const bv = b.metric[sortKey];
      const delta = av - bv;
      return sortDir === "asc" ? delta : -delta;
    });

    return withMetrics.map((entry) => entry.token);
  }, [
    resolvedTokens,
    favoriteListTokens,
    search,
    activeFilter,
    favorites,
    sortKey,
    sortDir,
    useServerBoardOrder,
    effectiveBnbUsd,
    kothContenderAddresses,
    airdropTokenAddresses,
  ]);

  const showExploreBoardSkeleton =
    activeFilter !== "favorites" && !boardDataReady;

  const exploreBoardTokens = boardDataReady ? marketTokens : [];

  const showLoadMore = activeFilter !== "favorites" && boardDataReady && (hasMore || loadingMore);

  const cardsTokens = useMemo(() => {
    if (activeFilter === "favorites") {
      return sortTokensForCards(exploreBoardTokens, cardsSort);
    }
    return exploreBoardTokens;
  }, [exploreBoardTokens, cardsSort, activeFilter]);

  const boardKeys = useMemo(
    () => exploreBoardTokens.map((token) => token.address.toLowerCase()),
    [exploreBoardTokens]
  );
  const boardResetKey = `${activeFilter}|${sortKey}|${sortDir}|${search.trim().toLowerCase()}`;
  const { rowClass: boardRowClass, rankClass: boardRankClass } = useLiveBoardAnimations(
    boardKeys,
    { resetKey: boardResetKey }
  );

  const filterCounts = useMemo(() => {
    const server = serverFilterCounts ?? {
      all: resolvedTokens.length,
      new: resolvedTokens.length,
      movers: 0,
      kothContenders: 0,
      hasAirdrop: 0,
    };
    return {
      ...server,
      favorites: favorites.size,
    };
  }, [serverFilterCounts, favorites.size, resolvedTokens.length]);

  function onSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("desc");
  }

  const sortLabel = (key: SortKey) =>
    headerSortKey === key ? `${sortDir === "asc" ? "↑" : "↓"}` : "";
  const sortHeadClass = (key: SortKey) =>
    `inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition ${
      headerSortKey === key ? "text-pump-accent" : "text-pump-muted hover:text-pump-text"
    }`;

  if (tokens === null && !error) {
    return <ArenaSkeleton />;
  }

  if (error && tokens === null) {
    return (
      <div className="notice-error p-4">
        {error}
      </div>
    );
  }

  if (
    resolvedTokens.length === 0 &&
    activeFilter !== "favorites" &&
    (activeFilter === "all" || activeFilter === "new")
  ) {
    return (
      <div className="panel-surface empty-state">
        <p className="empty-state-copy">No tokens yet. Be the first to launch a meme.</p>
      </div>
    );
  }

  return (
    <div
      className="min-w-0 space-y-3 md:space-y-4"
      aria-busy={boardRefreshing}
    >
      <ArenaMcapTicker tokens={mcapRankedTokens} />

      <ArenaShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {quickTradeTarget ? (
        <TradeSheet
          key={`${quickTradeTarget.tokenAddress}-${quickTradeTarget.prefill.side}`}
          open
          presentation="modal"
          onClose={() => setQuickTradeTarget(null)}
          tokenAddress={quickTradeTarget.tokenAddress}
          symbol={quickTradeTarget.symbol}
          status={quickTradeTarget.status}
          prefill={quickTradeTarget.prefill}
          onTradeConfirmed={() => {
            setQuickTradeTarget(null);
            window.dispatchEvent(new Event("pump:activity"));
          }}
        />
      ) : null}

      {kothToken ? (
        <section className="koth-section space-y-2 md:space-y-3">
          <SectionHeadingIcon icon={MetricIcons.kingOfHill}>King of the Hill</SectionHeadingIcon>

          <Link
            href={`/token/${kothToken.address}`}
            className="koth-banner panel-surface block"
          >
            <div className="koth-banner__inner">
              <TokenAvatar
                address={kothToken.address}
                symbol={kothToken.symbol}
                logoUrl={kothToken.logoUrl}
                size={48}
                className="koth-banner__logo shrink-0 md:hidden"
              />
              <TokenAvatar
                address={kothToken.address}
                symbol={kothToken.symbol}
                logoUrl={kothToken.logoUrl}
                size={60}
                className="koth-banner__logo hidden shrink-0 md:block"
              />

              <div className="koth-banner__content min-w-0 flex-1">
                <p className="koth-banner__headline">
                  <span className="financial-value koth-banner__headline-symbol">
                    {kothToken.symbol}
                  </span>
                </p>
                <div className="koth-banner__hero" aria-label="Market cap">
                  <span className="koth-banner__tag">MC</span>
                  <span className="financial-value koth-banner__hero-value text-pump-text">
                    {formatCapForBoard(bnbToUsd(Number(kothToken.marketCapBnb), effectiveBnbUsd))}
                  </span>
                  <PctChange
                    value={kothToken.change24hPct ?? null}
                    className="koth-banner__delta"
                  />
                </div>

                {kothReignDuration ? (
                  <p className="koth-banner__meta koth-banner__meta--lead">
                    <span className="koth-banner__meta-item">
                      <span className="koth-banner__tag koth-banner__tag--soft">King for</span>
                      <span className="financial-value koth-banner__meta-value">
                        {kothReignDuration}
                      </span>
                    </span>
                  </p>
                ) : null}
                <p className="koth-banner__meta koth-banner__meta--stats">
                  <span className="koth-banner__meta-item">
                    <span className="koth-banner__tag">Vol</span>
                    <span className="financial-value koth-banner__meta-value">
                      {formatUsdReadable(
                        bnbToUsd(Number(kothToken.volume24hBnb ?? 0), effectiveBnbUsd),
                        { compact: true }
                      )}
                    </span>
                  </span>
                  <span className="koth-banner__meta-sep" aria-hidden>
                    ·
                  </span>
                  <span className="koth-banner__meta-item max-md:hidden">
                    <span className="koth-banner__tag">Txns</span>
                    <span className="financial-value koth-banner__meta-value">
                      {formatCount(kothToken.tradeCount)}
                    </span>
                  </span>
                  <span className="koth-banner__meta-sep max-md:hidden" aria-hidden>
                    ·
                  </span>
                  <span className="koth-banner__meta-item max-md:hidden">
                    <span className="koth-banner__tag">Holders</span>
                    <span className="financial-value koth-banner__meta-value">
                      {formatCount(kothToken.holderCount)}
                    </span>
                  </span>
                  <span className="koth-banner__meta-sep max-md:hidden" aria-hidden>
                    ·
                  </span>
                  <span className="koth-banner__meta-item">
                    <span className="koth-banner__tag">ATH</span>
                    <span className="financial-value koth-banner__meta-value">
                      {formatCapForBoard(
                        bnbToUsd(
                          Number(kothToken.athMarketCapBnb ?? kothToken.marketCapBnb),
                          effectiveBnbUsd
                        )
                      )}
                    </span>
                  </span>
                </p>
              </div>

              <ChevronRight
                className="koth-banner__chevron hidden shrink-0 md:block"
                strokeWidth={ICON_STROKE}
                aria-hidden
              />
            </div>
          </Link>

          {kothSummary?.recent?.length ? (
            <div className="scroll-strip-row">
              <IconLabel
                icon={MetricIcons.recent}
                hideIconMobile
                className="section-label shrink-0 text-caption md:text-[inherit]"
              >
                Recent
              </IconLabel>
              <ScrollStripTrack aria-label="Recent kings">
                {kothSummary.recent.slice(0, RECENT_STRIP_DESKTOP).map((item, index) => (
                  <Link
                    key={`${item.tokenAddress}:${item.crownedAt}`}
                    href={`/token/${item.tokenAddress}`}
                    className={`contender-chip${index >= RECENT_STRIP_MOBILE ? " hidden md:inline-flex" : ""}`}
                  >
                    <TokenAvatar
                      address={item.tokenAddress}
                      symbol={item.symbol}
                      logoUrl={item.logoUrl}
                      size={16}
                      className="md:hidden"
                    />
                    <TokenAvatar
                      address={item.tokenAddress}
                      symbol={item.symbol}
                      logoUrl={item.logoUrl}
                      size={18}
                      className="hidden md:block"
                    />
                    <span className="text-caption text-pump-text">{item.symbol}</span>
                  </Link>
                ))}
              </ScrollStripTrack>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-3">
        {topGainer24h ? (
          <HighlightStatCard
            href={`/token/${topGainer24h.address}`}
            label="Top gainer"
            token={topGainer24h}
            icon={MetricIcons.topGainer}
          />
        ) : (
          <HighlightStatPlaceholder label="Top gainer" icon={MetricIcons.topGainer} />
        )}

        {topVolume24h ? (
          <HighlightStatCard
            href={`/token/${topVolume24h.address}`}
            label="Top volume"
            token={topVolume24h}
            icon={MetricIcons.topVolume}
          />
        ) : (
          <HighlightStatPlaceholder label="Top volume" icon={MetricIcons.topVolume} />
        )}

        {mostTrades ? (
          <HighlightStatCard
            href={`/token/${mostTrades.address}`}
            label="Most trades"
            token={mostTrades}
            icon={MetricIcons.mostTrades}
          />
        ) : (
          <HighlightStatPlaceholder label="Most trades" icon={MetricIcons.mostTrades} />
        )}
      </section>

      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionHeadingIcon icon={MetricIcons.exploreCoins}>Explore coins</SectionHeadingIcon>
          {viewMode === "board" || viewMode === "cards" ? <ArenaSwipeTradeBar /> : null}
        </div>

        <div className="arena-toolbar">
          <div className="arena-search-group">
            <div className="arena-toolbar-search">
              <FieldSearchInput
                ref={searchInputRef}
                embedded
                fieldOnly
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search coins"
              />
            </div>
            <div className="arena-search-end">
              <div
                className="arena-view-toggle arena-view-toggle--attached"
                role="group"
                aria-label="Arena view"
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleViewToggleClick("board")}
                  className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 text-caption sm:px-2.5 ${
                    viewMode === "board" ? "chip-button-active" : "chip-button"
                  }`}
                  aria-pressed={viewMode === "board"}
                  aria-label="Board view"
                >
                  <Table2 className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                  <span className="hidden sm:inline">Board</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleViewToggleClick("cards")}
                  className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 text-caption sm:px-2.5 ${
                    viewMode === "cards" ? "chip-button-active" : "chip-button"
                  }`}
                  aria-pressed={viewMode === "cards"}
                  aria-label="Cards view"
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </div>
            </div>
          </div>
          <div className="arena-toolbar-watchlist shrink-0 md:hidden">
            <ArenaWatchlistSheet
              tokens={arenaTokenPool}
              bnbUsd={effectiveBnbUsd}
              flashes={flashes}
              animatedCaps={animatedCaps}
            />
          </div>
          <div className="arena-filter-bar-wrap hidden md:block">
            <div className="arena-filter-bar" role="tablist" aria-label="Arena filters">
              <ArenaFilterChips
                activeFilter={activeFilter}
                filterCounts={filterCounts}
                onSelect={setArenaFilter}
              />
            </div>
          </div>
        </div>

        <div className="arena-filter-bar-wrap md:hidden">
          <div className="arena-filter-bar" role="tablist" aria-label="Arena filters">
            <ArenaFilterChips
              activeFilter={activeFilter}
              filterCounts={filterCounts}
              onSelect={setArenaFilter}
            />
          </div>
        </div>

        {viewMode === "cards" ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-caption text-pump-muted">
              <span className="hidden sm:inline">Sort</span>
              <select
                value={cardsSort}
                onChange={(event) =>
                  setCardsSortPreference(event.target.value as ArenaCardsSortKey)
                }
                className="field-input h-8 min-w-[9rem] bg-pump-surface/75 py-1 text-caption"
                aria-label="Sort cards by"
              >
                {(Object.keys(ARENA_CARDS_SORT_LABELS) as ArenaCardsSortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {ARENA_CARDS_SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <div className="arena-view-toggle" role="group" aria-label="Card density">
              <button
                type="button"
                onClick={() => setCardsDensityPreference("comfortable")}
                className={`px-3 py-1.5 text-caption ${
                  cardsDensity === "comfortable" ? "chip-button-active" : "chip-button"
                }`}
                aria-pressed={cardsDensity === "comfortable"}
              >
                Comfortable
              </button>
              <button
                type="button"
                onClick={() => setCardsDensityPreference("compact")}
                className={`px-3 py-1.5 text-caption ${
                  cardsDensity === "compact" ? "chip-button-active" : "chip-button"
                }`}
                aria-pressed={cardsDensity === "compact"}
              >
                Compact
              </button>
            </div>
          </div>
        ) : null}

        {showExploreBoardSkeleton ? (
          <SkeletonBoardTable rows={7} />
        ) : exploreBoardTokens.length === 0 ? (
          <div className="panel-surface empty-state py-8">
            <p className="empty-state-copy text-caption">
              {emptyExploreFilterCopy(activeFilter, {
                search,
                isConnected,
                favoritesCount: favorites.size,
                favoriteListLoaded: favoriteListTokens.length > 0 || favorites.size === 0,
              })}
            </p>
          </div>
        ) : viewMode === "cards" ? (
          <div
            className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
              cardsDensity === "compact" ? "md:gap-2 lg:gap-2" : ""
            }`}
          >
            {cardsTokens.map((token) => {
              const addressKey = token.address.toLowerCase();
              const mcapUsd =
                animatedCaps[`${addressKey}:cap:mcap`] ??
                bnbToUsd(Number(token.marketCapBnb), effectiveBnbUsd);
              const isKoth = kothToken?.address.toLowerCase() === addressKey;

              return (
                <ArenaTokenCard
                  key={token.address}
                  token={token}
                  mcapUsd={mcapUsd}
                  isKoth={isKoth}
                  isKothContender={kothContenderAddresses.has(addressKey)}
                  mcapFlash={flashes[`${addressKey}:mcap`]}
                  isFavorite={isFavorite(token.address)}
                  onToggleFavorite={toggleFavorite}
                  compact={cardsDensity === "compact"}
                  onBuy={() =>
                    openQuickTrade(token.address, token.symbol, token.status, "buy")
                  }
                  onSell={() =>
                    openQuickTrade(token.address, token.symbol, token.status, "sell")
                  }
                />
              );
            })}
          </div>
        ) : (
        <section className="arena-explore-board overflow-hidden">
        <div className="arena-explore-list lg:hidden">
          {exploreBoardTokens.map((token, index) => {
            const addressKey = token.address.toLowerCase();
            const mcapUsd =
              animatedCaps[`${addressKey}:cap:mcap`] ??
              bnbToUsd(Number(token.marketCapBnb), effectiveBnbUsd);
            const priceUsd =
              animatedCaps[`${addressKey}:cap:price`] ??
              listTokenPriceUsd(token.marketCapBnb, effectiveBnbUsd);
            return (
              <HoldingSwipeRow
                key={token.address}
                dataBoardKey={addressKey}
                rowClassName={boardRowClass(addressKey)}
                contentClassName="bg-pump-card"
                peekOnMount={index === 0}
                buyLabel="Buy"
                sellLabel="Sell"
                onBuyMax={() =>
                  openQuickTrade(token.address, token.symbol, token.status, "buy")
                }
                onSellMax={() =>
                  openQuickTrade(token.address, token.symbol, token.status, "sell")
                }
              >
                <ArenaExploreCoinRow
                  token={token}
                  mcapUsd={mcapUsd}
                  priceUsd={priceUsd}
                  bnbUsd={effectiveBnbUsd}
                  mcapFlash={flashes[`${addressKey}:mcap`]}
                  priceFlash={flashes[`${addressKey}:mcap`]}
                  change24hPct={token.change24hPct ?? null}
                />
              </HoldingSwipeRow>
            );
          })}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="sheet-grid min-w-[1280px]">
          <thead>
            <tr>
              <th />
              <th>Coin</th>
              <th className="arena-board-quick-cell">Quick trade</th>
              <th><button type="button" onClick={() => onSort("mcap")} className={sortHeadClass("mcap")}><TableHeaderLabel icon={MetricIcons.mcap}>MCAP</TableHeaderLabel> {sortLabel("mcap")}</button></th>
              <th><button type="button" onClick={() => onSort("ath")} className={sortHeadClass("ath")}><TableHeaderLabel icon={MetricIcons.ath}>ATH</TableHeaderLabel> {sortLabel("ath")}</button></th>
              <th><button type="button" onClick={() => onSort("age")} className={sortHeadClass("age")}><TableHeaderLabel icon={MetricIcons.age}>Age</TableHeaderLabel> {sortLabel("age")}</button></th>
              <th><button type="button" onClick={() => onSort("txns")} className={sortHeadClass("txns")}><TableHeaderLabel icon={MetricIcons.txns}>TXNS</TableHeaderLabel> {sortLabel("txns")}</button></th>
              <th><button type="button" onClick={() => onSort("vol24h")} className={sortHeadClass("vol24h")}><TableHeaderLabel icon={MetricIcons.vol24h}>24H VOL</TableHeaderLabel> {sortLabel("vol24h")}</button></th>
              <th><button type="button" onClick={() => onSort("traders")} className={sortHeadClass("traders")}><TableHeaderLabel icon={MetricIcons.traders}>TRADERS</TableHeaderLabel> {sortLabel("traders")}</button></th>
              <th><button type="button" onClick={() => onSort("h1")} className={sortHeadClass("h1")}><TableHeaderLabel icon={MetricIcons.change1h}>1H</TableHeaderLabel> {sortLabel("h1")}</button></th>
              <th><button type="button" onClick={() => onSort("h6")} className={sortHeadClass("h6")}><TableHeaderLabel icon={MetricIcons.change6h}>6H</TableHeaderLabel> {sortLabel("h6")}</button></th>
              <th><button type="button" onClick={() => onSort("h24")} className={sortHeadClass("h24")}><TableHeaderLabel icon={MetricIcons.change24h}>24H</TableHeaderLabel> {sortLabel("h24")}</button></th>
            </tr>
          </thead>
          <tbody>
            {exploreBoardTokens.map((token, index) => {
              const addressKey = token.address.toLowerCase();
              const mcapUsd =
                animatedCaps[`${addressKey}:cap:mcap`] ??
                bnbToUsd(Number(token.marketCapBnb), effectiveBnbUsd);
              const athMcapUsd =
                animatedCaps[`${addressKey}:cap:ath`] ??
                bnbToUsd(Number(token.athMarketCapBnb ?? token.marketCapBnb), effectiveBnbUsd);
              const vol24hUsd =
                animatedCaps[`${addressKey}:cap:vol24h`] ??
                bnbToUsd(Number(token.volume24hBnb ?? 0), effectiveBnbUsd);
              return (
                <tr
                  key={token.address}
                  data-board-key={addressKey}
                  className={`${boardRowClass(addressKey)} arena-board-row--clickable`}
                  onClick={() => openTokenDetail(token.address)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTokenDetail(token.address);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`View ${token.symbol}`}
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(token.address)}
                      className={`text-xl leading-none transition ${
                        isFavorite(token.address)
                          ? "text-pump-accent"
                          : "text-pump-muted hover:text-pump-text"
                      }`}
                      aria-label="Toggle favorite"
                    >
                      {isFavorite(token.address) ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`financial-value w-4 text-caption text-pump-muted ${boardRankClass(addressKey)}`}
                      >
                        {index + 1}
                      </span>
                      <TokenAvatar
                        address={token.address}
                        symbol={token.symbol}
                        logoUrl={token.logoUrl}
                        size={30}
                      />
                      <div className="flex min-w-0 items-baseline gap-2">
                        <p className="truncate text-body-sm font-medium text-pump-text">{token.name}</p>
                        <p className="shrink-0 text-caption text-pump-muted">{token.symbol}</p>
                      </div>
                    </div>
                  </td>
                  <td className="arena-board-quick-cell" onClick={(event) => event.stopPropagation()}>
                    <ArenaBoardRowQuickActions
                      onBuy={() =>
                        openQuickTrade(token.address, token.symbol, token.status, "buy")
                      }
                      onSell={() =>
                        openQuickTrade(token.address, token.symbol, token.status, "sell")
                      }
                    />
                  </td>
                  <td
                    className={`px-4 py-3 financial-value font-semibold ${flashText(
                      flashes[`${token.address.toLowerCase()}:mcap`]
                    )}`}
                  >
                    {formatCapForBoard(mcapUsd)}
                  </td>
                  <td
                    className={`px-4 py-3 ${flashText(
                      flashes[`${token.address.toLowerCase()}:ath`]
                    )}`}
                  >
                    <p className="financial-value">
                      {formatCapForBoard(athMcapUsd)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-pump-text">{formatAge(token.createdAt)}</td>
                  <td
                    className={`px-4 py-3 financial-value ${flashText(
                      flashes[`${token.address.toLowerCase()}:txns`]
                    )}`}
                  >
                    {token.tradeCount ?? 0}
                  </td>
                  <td
                    className={`px-4 py-3 financial-value ${flashText(
                      flashes[`${token.address.toLowerCase()}:vol24h`]
                    )}`}
                  >
                    {formatUsdReadable(vol24hUsd, { compact: true })}
                  </td>
                  <td
                    className={`px-4 py-3 financial-value ${flashText(
                      flashes[`${token.address.toLowerCase()}:traders`]
                    )}`}
                  >
                    {token.traders24h ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <PctChange value={token.change1hPct ?? null} />
                  </td>
                  <td className="px-4 py-3">
                    <PctChange value={token.change6hPct ?? null} />
                  </td>
                  <td className="px-4 py-3">
                    <PctChange value={token.change24hPct ?? null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        </section>
        )}

        {showLoadMore ? (
          <div ref={loadMoreRef} className="flex justify-center py-3 md:py-4">
            {loadingMore ? (
              <p className="text-caption text-pump-muted">Loading more coins…</p>
            ) : (
              <div className="h-1 w-full" aria-hidden />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

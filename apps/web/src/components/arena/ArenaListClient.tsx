"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { ArenaFilterCounts, KothSummary, TokenListItem } from "@/lib/db/launchpad";
import { ArenaFilterNav } from "@/components/arena/ArenaFilterNav";
import { ArenaShortcutsModal } from "@/components/arena/ArenaShortcutsModal";
import { ArenaMobileTokenRow } from "@/components/arena/ArenaMobileTokenRow";
import { ArenaTokenCard } from "@/components/arena/ArenaTokenCard";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useArenaQuickTrade } from "@/hooks/useArenaQuickTrade";
import { useArenaQuickTradeSettings } from "@/hooks/useArenaQuickTradeSettings";
import { bnbToUsd } from "@/lib/format-usd";
import {
  listTokenPriceUsd,
} from "@/lib/arena-board-format";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";
import { useRafMessageQueue } from "@/hooks/useRafMessageQueue";
import { readArenaCardsSort, writeArenaCardsSort, type ArenaCardsSortKey } from "@/lib/arena-cards-prefs";
import {
  readArenaFilter,
  writeArenaFilter,
  type BoardFilter,
} from "@/lib/arena-filters";
import type { ArenaTradeWsPayload } from "@/lib/arena-live-delta";
import { patchArenaTokenList } from "@/lib/arena-live-delta";
import type { AirdropListItem } from "@/lib/db/airdrops";
import { collectOpenAirdropLinkedTokens } from "@/lib/airdrop-linked-tokens";
import { addressCacheKey } from "@/lib/address";
import { useQueryClient } from "@tanstack/react-query";
import {
  arenaBoardQueryKey,
  fetchArenaBoard,
  type ArenaBoardQueryParams,
} from "@/lib/arena-client-api";
import type { ArenaHomePayload } from "@/lib/arena-server";
import { resolveDisplayNativeUsd } from "@/lib/native-usd-price";

const SERVER_BOARD_FILTERS = new Set<BoardFilter>([
  "movers",
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
    case "hasAirdrop":
      return "No coins with an active airdrop right now.";
    default:
      return "No coins match this filter.";
  }
}

type FlashTone = "up" | "down";
type SortKey = "mcap" | "ath" | "age" | "txns" | "vol24h" | "traders" | "h1" | "h6" | "h24";
type SortDir = "asc" | "desc";

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
  airdropTokenAddresses: Set<string>
): boolean {
  if (filter === "new") {
    return true;
  }
  if (filter === "movers") {
    return Math.abs(token.change24hPct ?? 0) >= 1;
  }
  if (filter === "favorites") {
    const key = addressCacheKey(token.address);
    return key != null && favorites.has(key);
  }
  if (filter === "hasAirdrop") {
    const key = addressCacheKey(token.address);
    return key != null && airdropTokenAddresses.has(key);
  }
  return true;
}

export function ArenaListClient({
  initialPayload = null,
}: {
  initialPayload?: ArenaHomePayload | null;
}) {
  const queryClient = useQueryClient();
  const { openQuickTrade, quickTradeSheet } = useArenaQuickTrade();
  const {
    openSettings: openQuickTradeSettings,
    settingsOpen: quickTradeSettingsOpen,
    settingsLayer,
  } = useArenaQuickTradeSettings();
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
  const [apiBnbUsd, setApiBnbUsd] = useState<number | null>(
    initialPayload?.nativeUsd ?? initialPayload?.bnbUsd ?? null
  );
  const [airdropTokenAddresses, setAirdropTokenAddresses] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [flashes, setFlashes] = useState<Record<string, FlashTone>>({});
  const [animatedCaps, setAnimatedCaps] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<BoardFilter>("new");
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [cardsSort, setCardsSort] = useState<ArenaCardsSortKey>("mcap");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [favoriteListTokens, setFavoriteListTokens] = useState<TokenListItem[]>([]);
  const { address, isConnected } = useAccount();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { bnbUsd: hookBnbUsd } = useBnbUsdPrice();
  const effectiveBnbUsd = resolveDisplayNativeUsd(hookBnbUsd, apiBnbUsd);
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
    activeFilter === "movers"
      ? "h24"
      : cardsSort === "vol24h"
        ? "vol24h"
        : cardsSort === "h24"
          ? "h24"
          : sortKey;
  const apiSortDir: SortDir = activeFilter === "movers" ? sortDir : "desc";
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

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/airdrops", { cache: "no-store" });
        const body = (await response.json()) as { data?: AirdropListItem[] };
        if (!response.ok || !body.data) return;

        const addresses = collectOpenAirdropLinkedTokens(body.data);
        setAirdropTokenAddresses(addresses);
      } catch {
        // Keep empty set on failure.
      }
    })();
  }, []);

  useEffect(() => {
    const filter = readArenaFilter();
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
        const boardParams: ArenaBoardQueryParams = {
          limit,
          sortKey: apiSortKey,
          sortDir: apiSortDir,
          filter: activeFilter === "favorites" ? "all" : activeFilter,
          airdropAddresses:
            activeFilter === "hasAirdrop" && airdropTokenAddresses.size > 0
              ? [...airdropTokenAddresses]
              : undefined,
        };

        const body = await queryClient.fetchQuery({
          queryKey: arenaBoardQueryKey(boardParams),
          queryFn: () => fetchArenaBoard(boardParams),
          staleTime: 2_000,
        });

        if (requestBoardKey !== currentBoardKeyRef.current) {
          return;
        }

        const nextTokens = body.data ?? [];
        setTopByMcap(body.topByMcap ?? []);
        setKothSummary(body.koth ?? null);
        setServerFilterCounts(body.meta?.filterCounts ?? null);
        setHasMore(body.meta?.hasMore ?? false);
        const seededNativeUsd = body.nativeUsd ?? body.bnbUsd;
        if (
          seededNativeUsd != null &&
          Number.isFinite(seededNativeUsd) &&
          seededNativeUsd > 0
        ) {
          setApiBnbUsd(seededNativeUsd);
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
    [queryClient, apiSortKey, apiSortDir, activeFilter, airdropTokenAddresses, getComparableValues, triggerFlash, currentBoardKey]
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
      sortKey === "age" &&
      sortDir === "desc";

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

    if (ssrDefaultsMatch) {
      setLoadedBoardKey(key);
      initialPayloadRef.current = null;
      void loadRef.current(ARENA_PAGE_INITIAL, { silent: true, boardKey: key });
      return;
    }

    setBoardRefreshing(true);
    initialPayloadRef.current = null;
    void loadRef.current(ARENA_PAGE_INITIAL, { silent: true, boardKey: key });
  }, [apiSortKey, apiSortDir, activeFilter, airdropFilterKey, currentBoardKey]);

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
  }, [activeFilter, hasMore, loadingMore, tokens?.length]);

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
        const key = addressCacheKey(token.address);
        return key != null && favorites.has(key);
      }
      if (SERVER_BOARD_FILTERS.has(activeFilter)) {
        return true;
      }
      return matchesBoardFilter(
        token,
        activeFilter,
        favorites,
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
    airdropTokenAddresses,
  ]);

  const exploreBoardTokens =
    activeFilter === "favorites" || tokens !== null ? marketTokens : [];

  const showLoadMore =
    activeFilter !== "favorites" &&
    loadedBoardKey === currentBoardKey &&
    (hasMore || loadingMore);

  const cardsTokens = useMemo(() => {
    if (activeFilter === "favorites") {
      return sortTokensForCards(exploreBoardTokens, cardsSort);
    }
    return exploreBoardTokens;
  }, [exploreBoardTokens, cardsSort, activeFilter]);

  const filterCounts = useMemo(() => {
    const server = serverFilterCounts ?? {
      all: resolvedTokens.length,
      new: resolvedTokens.length,
      movers: 0,
      kothContenders: 0,
      hasAirdrop: 0,
    };
    const clientAirdropCount = airdropTokenAddresses.size;
    return {
      ...server,
      hasAirdrop: Math.max(server.hasAirdrop, clientAirdropCount),
      favorites: favorites.size,
    };
  }, [serverFilterCounts, favorites.size, resolvedTokens.length, airdropTokenAddresses]);

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
    <div className="arena-page min-w-0" aria-busy={boardRefreshing}>
      <HubDiscoveryScrollLock />
      <ArenaShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {settingsLayer}

      <div className="arena-page__sticky">
        <div className="arena-hub">
          <ArenaFilterNav
            activeFilter={activeFilter}
            filterCounts={filterCounts}
            search={search}
            searchInputRef={searchInputRef}
            onSearchChange={setSearch}
            onSelect={setArenaFilter}
            onQuickTradeSettingsOpen={openQuickTradeSettings}
            quickTradeSettingsOpen={quickTradeSettingsOpen}
          />
        </div>
      </div>

      <div className="arena-page__scroll">
        {exploreBoardTokens.length === 0 ? (
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
        ) : (
          <>
            <div className="arena-mobile-list md:hidden">
              {cardsTokens.map((token) => {
                const addressKey = token.address.toLowerCase();
                const mcapUsd =
                  animatedCaps[`${addressKey}:cap:mcap`] ??
                  bnbToUsd(Number(token.marketCapBnb), effectiveBnbUsd);
                const vol24hUsd =
                  animatedCaps[`${addressKey}:cap:vol24h`] ??
                  bnbToUsd(Number(token.volume24hBnb ?? 0), effectiveBnbUsd);

                return (
                  <ArenaMobileTokenRow
                    key={token.address}
                    token={token}
                    mcapUsd={mcapUsd}
                    vol24hUsd={vol24hUsd}
                    mcapFlash={flashes[`${addressKey}:mcap`]}
                    onQuickTrade={(side) => openQuickTrade(token.address, token.symbol, side)}
                  />
                );
              })}
            </div>
            <div className="arena-explore-grid arena-explore-grid--compact hidden md:grid">
              {cardsTokens.map((token) => {
                const addressKey = token.address.toLowerCase();
                const mcapUsd =
                  animatedCaps[`${addressKey}:cap:mcap`] ??
                  bnbToUsd(Number(token.marketCapBnb), effectiveBnbUsd);

                return (
                  <ArenaTokenCard
                    key={token.address}
                    token={token}
                    mcapUsd={mcapUsd}
                    mcapFlash={flashes[`${addressKey}:mcap`]}
                    isFavorite={isFavorite(token.address)}
                    onToggleFavorite={toggleFavorite}
                    onQuickTrade={(side) => openQuickTrade(token.address, token.symbol, side)}
                    compact
                  />
                );
              })}
            </div>
          </>
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
      {quickTradeSheet}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { ArenaFilterCounts, TokenListItem } from "@/lib/db/launchpad";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd } from "@/lib/format-usd";
import { listTokenPriceUsd } from "@/lib/arena-board-format";
import {
  isTokenSpotlightPinned,
  sortTokensWithSpotlightFirst,
  useLaunchSpotlightPins,
} from "@/hooks/useLaunchSpotlightPins";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";
import { useRafMessageQueue } from "@/hooks/useRafMessageQueue";
import { useLiveBoardAnimations } from "@/hooks/useLiveBoardAnimations";
import {
  readArenaFilter,
  writeArenaFilter,
  type BoardFilter,
} from "@/lib/arena-filters";
import type { ArenaTradeWsPayload } from "@/lib/arena-live-delta";
import { patchArenaTokenList } from "@/lib/arena-live-delta";
import type { AirdropListItem } from "@/lib/db/airdrops";
import { collectOpenAirdropLinkedTokens } from "@/lib/airdrop-linked-tokens";
import {
  arenaBoardQueryKey,
  fetchArenaBoard,
  type ArenaBoardQueryParams,
} from "@/lib/arena-client-api";
import { resolveDisplayNativeUsd } from "@/lib/native-usd-price";
import {
  ARENA_BOARD_PAGE_INCREMENT,
  ARENA_BOARD_PAGE_INITIAL,
  apiBoardFilter,
  applyBoardFilterDefaults,
  boardCacheKey,
  matchesBoardFilter,
  SERVER_BOARD_FILTERS,
  type BoardSortDir,
  type BoardSortKey,
  type FlashTone,
  type BoardCacheEntry,
  arenaExploreBoardCache,
} from "@/lib/arena-explore-board-core";

export type UseArenaExploreBoardOptions = {
  pageSize?: number;
  /** Token sidebar — skip pump-style row land/rank animations on hydrate. */
  animateRows?: boolean;
};

function peekDefaultNewBoard(): BoardCacheEntry | null {
  return arenaExploreBoardCache.get(boardCacheKey("new", "age", "desc", "")) ?? null;
}

export function useArenaExploreBoard(options: UseArenaExploreBoardOptions = {}) {
  const pageSize = options.pageSize ?? ARENA_BOARD_PAGE_INITIAL;
  const animateRows = options.animateRows !== false;
  const queryClient = useQueryClient();
  const seededBoard = peekDefaultNewBoard();
  const [tokens, setTokens] = useState<TokenListItem[] | null>(() => seededBoard?.tokens ?? null);
  const [loadedBoardKey, setLoadedBoardKey] = useState(() =>
    seededBoard ? boardCacheKey("new", "age", "desc", "") : ""
  );
  const [topByMcap, setTopByMcap] = useState<TokenListItem[]>(() => seededBoard?.topByMcap ?? []);
  const [serverFilterCounts, setServerFilterCounts] = useState<ArenaFilterCounts | null>(
    () => seededBoard?.serverFilterCounts ?? null
  );
  const [hasMore, setHasMore] = useState(() => seededBoard?.hasMore ?? false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [boardRefreshing, setBoardRefreshing] = useState(false);
  const [apiBnbUsd, setApiBnbUsd] = useState<number | null>(null);
  const [airdropTokenAddresses, setAirdropTokenAddresses] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [flashes, setFlashes] = useState<Record<string, FlashTone>>({});
  const [animatedCaps, setAnimatedCaps] = useState<Record<string, number>>({});
  const [activeFilter, setActiveFilter] = useState<BoardFilter>("new");
  const [sortKey, setSortKey] = useState<BoardSortKey>("age");
  const [sortDir, setSortDir] = useState<BoardSortDir>("desc");
  const [search, setSearch] = useState("");
  const { address, isConnected } = useAccount();
  const {
    favorites,
    favoriteTokens,
    isFavorite,
    toggleFavorite: toggleFavoriteBase,
    upsertFavoriteSnapshots,
  } = useFavorites();
  const { bnbUsd: hookBnbUsd } = useBnbUsdPrice();
  const effectiveBnbUsd = resolveDisplayNativeUsd(hookBnbUsd, apiBnbUsd);
  const { byToken: spotlightByToken } = useLaunchSpotlightPins();
  const effectiveBnbUsdRef = useRef(effectiveBnbUsd);
  effectiveBnbUsdRef.current = effectiveBnbUsd;
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const capAnimFrameRef = useRef<Record<string, number>>({});
  const animatedCapsRef = useRef<Record<string, number>>({});
  const tokensRef = useRef<TokenListItem[] | null>(seededBoard?.tokens ?? null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const listLimitRef = useRef(pageSize);
  const apiSortKey: BoardSortKey = activeFilter === "movers" ? "h24" : sortKey;
  const apiSortDir: BoardSortDir = sortDir;
  const useServerBoardOrder = activeFilter !== "favorites";

  const toggleFavorite = useCallback(
    (tokenAddress: string, snapshot?: TokenListItem) => {
      const key = tokenAddress.toLowerCase();
      const resolved =
        snapshot ??
        tokensRef.current?.find((token) => token.address.toLowerCase() === key) ??
        favoriteTokens.find((token) => token.address.toLowerCase() === key);
      toggleFavoriteBase(tokenAddress, resolved);
    },
    [toggleFavoriteBase, favoriteTokens]
  );

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/airdrops", { cache: "no-store" });
        const body = (await response.json()) as { data?: AirdropListItem[] };
        if (!response.ok || !body.data) return;
        setAirdropTokenAddresses(collectOpenAirdropLinkedTokens(body.data));
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
  }, []);

  const setArenaFilter = useCallback((filter: BoardFilter) => {
    setActiveFilter(filter);
    writeArenaFilter(filter);
    const defaults = applyBoardFilterDefaults(filter);
    if (defaults.sortKey) setSortKey(defaults.sortKey);
    if (defaults.sortDir) setSortDir(defaults.sortDir);
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
        arenaExploreBoardCache.set(requestBoardKey, {
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
    [
      queryClient,
      apiSortKey,
      apiSortDir,
      activeFilter,
      airdropTokenAddresses,
      getComparableValues,
      triggerFlash,
      currentBoardKey,
    ]
  );

  tokensRef.current = tokens;

  useEffect(() => {
    if (!tokens?.length) return;
    const favSnapshots = tokens.filter((token) => favorites.has(token.address.toLowerCase()));
    if (favSnapshots.length) upsertFavoriteSnapshots(favSnapshots);
  }, [tokens, favorites, upsertFavoriteSnapshots]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const nextLimit = listLimitRef.current + ARENA_BOARD_PAGE_INCREMENT;
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

    listLimitRef.current = pageSize;
    setHasMore(false);
    setLoadingMore(false);

    const key = currentBoardKey;
    const cached = arenaExploreBoardCache.get(key);

    if (cached) {
      setTokens(cached.tokens);
      setTopByMcap(cached.topByMcap);
      setHasMore(cached.hasMore);
      if (cached.serverFilterCounts) {
        setServerFilterCounts(cached.serverFilterCounts);
      }
      setLoadedBoardKey(key);
      void loadRef.current(pageSize, { silent: true, boardKey: key });
      return;
    }

    setBoardRefreshing(true);
    void loadRef.current(pageSize, { silent: true, boardKey: key });
  }, [apiSortKey, apiSortDir, activeFilter, airdropFilterKey, currentBoardKey, pageSize]);

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
      const vol24hTarget = bnbToUsd(Number(token.volume24hBnb ?? 0), effectiveBnbUsd);

      if (mcapTarget != null && Number.isFinite(mcapTarget)) {
        const key = `${address}:cap:mcap`;
        if (animatedCapsRef.current[key] == null) setAnimatedCap(key, mcapTarget);
        else animateCap(key, mcapTarget);
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
    const sourceTokens = activeFilter === "favorites" ? favoriteTokens : resolvedTokens;

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
    favoriteTokens,
    search,
    activeFilter,
    favorites,
    sortKey,
    sortDir,
    useServerBoardOrder,
    effectiveBnbUsd,
    airdropTokenAddresses,
  ]);

  const exploreBoardTokens = useMemo(() => {
    const base = activeFilter === "favorites" || tokens !== null ? marketTokens : [];
    return sortTokensWithSpotlightFirst(base, spotlightByToken).map((token) => {
      const pinned = isTokenSpotlightPinned(token.address, spotlightByToken);
      if (!pinned && !token.spotlightPinned) return token;
      return {
        ...token,
        spotlightPinned: pinned,
        spotlightExpiresAt: spotlightByToken[token.address.toLowerCase()] ?? null,
      };
    });
  }, [activeFilter, tokens, marketTokens, spotlightByToken]);

  const showLoadMore =
    activeFilter !== "favorites" &&
    loadedBoardKey === currentBoardKey &&
    (hasMore || loadingMore);

  const boardKeys = useMemo(
    () => exploreBoardTokens.map((token) => token.address.toLowerCase()),
    [exploreBoardTokens]
  );
  const boardResetKey = `${activeFilter}|${sortKey}|${sortDir}|${search.trim().toLowerCase()}`;
  const { rowClass: liveBoardRowClass } = useLiveBoardAnimations(boardKeys, {
    resetKey: boardResetKey,
    skipLanding: !animateRows,
  });
  const boardRowClass = useCallback(
    (key: string) => (animateRows ? liveBoardRowClass(key) : ""),
    [animateRows, liveBoardRowClass]
  );

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

  return {
    exploreBoardTokens,
    activeFilter,
    setArenaFilter,
    filterCounts,
    effectiveBnbUsd,
    flashes,
    animatedCaps,
    boardRowClass,
    isFavorite,
    toggleFavorite,
    airdropTokenAddresses,
    error,
    tokens,
    boardRefreshing,
    showLoadMore,
    loadingMore,
    loadMoreRef,
    isConnected,
    favorites,
    favoriteTokens,
    favoriteListTokens: favoriteTokens,
    search,
    setSearch,
  };
}

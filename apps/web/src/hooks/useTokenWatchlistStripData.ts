"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardFilter } from "@/lib/arena-filters";
import {
  applyBoardFilterDefaults,
  arenaExploreBoardCache,
  boardCacheKey,
  apiBoardFilter,
} from "@/lib/arena-explore-board-core";
import { fetchArenaBoard } from "@/lib/arena-client-api";
import type { TokenListItem } from "@/lib/db/launchpad";

function sortByMarketCap(tokens: TokenListItem[]): TokenListItem[] {
  return [...tokens].sort(
    (a, b) => Number(b.marketCapBnb ?? 0) - Number(a.marketCapBnb ?? 0)
  );
}

function boardTokensFromCache(filter: BoardFilter): TokenListItem[] {
  const defaults = applyBoardFilterDefaults(filter);
  const sortKey = defaults.sortKey ?? "mcap";
  const sortDir = defaults.sortDir ?? "desc";
  const cacheKey = boardCacheKey(apiBoardFilter(filter), sortKey, sortDir, "");
  const cached = arenaExploreBoardCache.get(cacheKey);
  if (!cached) return [];

  const source =
    filter === "all" && cached.topByMcap.length > 0 ? cached.topByMcap : cached.tokens;
  return sortByMarketCap(source);
}

export function useTokenWatchlistStripData(
  effectiveFilter: BoardFilter,
  favoriteTokens: TokenListItem[]
) {
  const [boardTokens, setBoardTokens] = useState<TokenListItem[]>(() =>
    boardTokensFromCache(effectiveFilter)
  );

  const watchlistTokens = useMemo(
    () => sortByMarketCap(favoriteTokens),
    [favoriteTokens]
  );

  useEffect(() => {
    if (effectiveFilter === "favorites") {
      setBoardTokens([]);
      return;
    }

    const cached = boardTokensFromCache(effectiveFilter);
    if (cached.length > 0) {
      setBoardTokens(cached);
    }

    let cancelled = false;

    const defaults = applyBoardFilterDefaults(effectiveFilter);
    const sortKey = defaults.sortKey ?? "mcap";
    const sortDir = defaults.sortDir ?? "desc";
    const cacheKey = boardCacheKey(apiBoardFilter(effectiveFilter), sortKey, sortDir, "");

    void fetchArenaBoard({
      limit: 40,
      sortKey,
      sortDir,
      filter: effectiveFilter,
    })
      .then((body) => {
        if (cancelled) return;
        arenaExploreBoardCache.set(cacheKey, {
          tokens: body.data ?? [],
          topByMcap: body.topByMcap ?? [],
          koth: body.koth ?? null,
          hasMore: body.meta?.hasMore ?? false,
          serverFilterCounts: body.meta?.filterCounts ?? null,
        });
        const source =
          effectiveFilter === "all" && body.topByMcap.length > 0
            ? body.topByMcap
            : (body.data ?? []);
        setBoardTokens(sortByMarketCap(source));
      })
      .catch(() => {
        if (!cancelled && cached.length === 0) {
          setBoardTokens([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveFilter]);

  const tokens =
    effectiveFilter === "favorites" ? watchlistTokens : boardTokens;

  return { tokens };
}

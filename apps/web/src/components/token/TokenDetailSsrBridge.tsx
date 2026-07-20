"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { ArenaHomePayload } from "@/lib/arena-server";
import type { TokenDetailBundle } from "@/lib/token-server";
import { normalizeRouteAddressKey } from "@/lib/address";
import { seedTokenDetailBundle } from "@/lib/token-detail-client";
import {
  arenaExploreBoardCache,
  boardCacheKey,
  type BoardCacheEntry,
} from "@/lib/arena-explore-board-core";

type SeedMaps = {
  bundles: Map<string, TokenDetailBundle>;
  boards: Map<string, ArenaHomePayload>;
};

type TokenDetailSsrContextValue = {
  registerBundle: (address: string, bundle: TokenDetailBundle) => void;
  peekBundle: (address: string) => TokenDetailBundle | null;
  registerBoard: (payload: ArenaHomePayload) => void;
  peekBoard: () => ArenaHomePayload | null;
};

const TokenDetailSsrContext = createContext<TokenDetailSsrContextValue | null>(null);

function seedExploreBoardCache(payload: ArenaHomePayload): void {
  const key = boardCacheKey("new", "age", "desc", "");
  if (arenaExploreBoardCache.has(key)) return;
  const entry: BoardCacheEntry = {
    tokens: payload.data,
    topByMcap: payload.topByMcap,
    koth: payload.koth,
    hasMore: payload.meta.hasMore,
    serverFilterCounts: payload.meta.filterCounts,
  };
  arenaExploreBoardCache.set(key, entry);
}

export function TokenDetailSsrProvider({ children }: { children: ReactNode }) {
  const mapsRef = useRef<SeedMaps>({
    bundles: new Map(),
    boards: new Map(),
  });

  const value = useMemo<TokenDetailSsrContextValue>(
    () => ({
      registerBundle: (address, bundle) => {
        const key = normalizeRouteAddressKey(address);
        mapsRef.current.bundles.set(key, bundle);
        seedTokenDetailBundle(key, bundle);
      },
      peekBundle: (address) =>
        mapsRef.current.bundles.get(normalizeRouteAddressKey(address)) ?? null,
      registerBoard: (payload) => {
        mapsRef.current.boards.set("default", payload);
        seedExploreBoardCache(payload);
      },
      peekBoard: () => mapsRef.current.boards.get("default") ?? null,
    }),
    []
  );

  return (
    <TokenDetailSsrContext.Provider value={value}>{children}</TokenDetailSsrContext.Provider>
  );
}

function useTokenDetailSsr(): TokenDetailSsrContextValue {
  const ctx = useContext(TokenDetailSsrContext);
  if (!ctx) {
    throw new Error("TokenDetailSsrProvider missing");
  }
  return ctx;
}

/** Server page hydrator — registers during render so Shell peeks before first paint. */
export function TokenDetailSsrSeed({
  address,
  initialBundle,
  boardSeed,
}: {
  address: string;
  initialBundle: TokenDetailBundle | null;
  boardSeed: ArenaHomePayload | null;
}) {
  const { registerBundle, registerBoard } = useTokenDetailSsr();
  if (initialBundle) {
    registerBundle(address, initialBundle);
  }
  if (boardSeed) {
    registerBoard(boardSeed);
  }
  return null;
}

export function useTokenDetailSsrBundle(address: string): TokenDetailBundle | null {
  const { peekBundle } = useTokenDetailSsr();
  return peekBundle(address);
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TokenListItem } from "@/lib/db/launchpad";
import { subscribeUserBootstrap } from "@/lib/user-bootstrap";
import { useLocalFirstReads } from "@/lib/local-first/flags";
import {
  getLocalFavoriteTokens,
  getLocalFavorites,
  setLocalFavoriteTokens,
  setLocalFavorites,
} from "@/lib/local-first/user-local-store";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";

type FavoritesContextValue = {
  favorites: Set<string>;
  favoriteTokens: TokenListItem[];
  isFavorite: (tokenAddress: string) => boolean;
  toggleFavorite: (tokenAddress: string, snapshot?: TokenListItem) => void;
  upsertFavoriteSnapshots: (tokens: TokenListItem[]) => void;
  loading: boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function normalizeFavoriteKey(tokenAddress: string): string {
  return tokenAddress.toLowerCase();
}

function tokensMapFromList(tokens: TokenListItem[]): Map<string, TokenListItem> {
  const map = new Map<string, TokenListItem>();
  for (const token of tokens) {
    map.set(normalizeFavoriteKey(token.address), token);
  }
  return map;
}

function favoriteTokensFromSet(
  favorites: Set<string>,
  byAddress: Map<string, TokenListItem>
): TokenListItem[] {
  const out: TokenListItem[] = [];
  for (const address of favorites) {
    const token = byAddress.get(address);
    if (token) out.push(token);
  }
  return out;
}

function persistFavoriteTokens(address: string, favorites: Set<string>, byAddress: Map<string, TokenListItem>) {
  if (!useLocalFirstReads()) return;
  setLocalFavoriteTokens(address, favoriteTokensFromSet(favorites, byAddress));
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useActiveWalletAddress();
  const { openConnectModal } = useOpenConnectModal();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoriteTokensByAddress, setFavoriteTokensByAddress] = useState<
    Map<string, TokenListItem>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<Set<string>>(new Set());
  const favoriteTokensByAddressRef = useRef(favoriteTokensByAddress);
  favoriteTokensByAddressRef.current = favoriteTokensByAddress;

  const favoriteTokens = useMemo(
    () => favoriteTokensFromSet(favorites, favoriteTokensByAddress),
    [favorites, favoriteTokensByAddress]
  );

  const upsertFavoriteSnapshots = useCallback((tokens: TokenListItem[]) => {
    if (!tokens.length) return;
    setFavoriteTokensByAddress((prev) => {
      const next = new Map(prev);
      for (const token of tokens) {
        next.set(normalizeFavoriteKey(token.address), token);
      }
      if (address && useLocalFirstReads()) {
        persistFavoriteTokens(address, favorites, next);
      }
      return next;
    });
  }, [address, favorites]);

  const reconcileFavoriteTokens = useCallback(
    async (favoriteSet: Set<string>, mergeInto?: Map<string, TokenListItem>) => {
      if (!address || favoriteSet.size === 0) {
        setFavoriteTokensByAddress(new Map());
        return;
      }

      const base = new Map(mergeInto ?? favoriteTokensByAddressRef.current);
      const missing = [...favoriteSet].filter((item) => !base.has(item));
      if (missing.length === 0) {
        setFavoriteTokensByAddress(base);
        persistFavoriteTokens(address, favoriteSet, base);
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
        const next = new Map(base);
        for (const token of body.tokens ?? []) {
          next.set(normalizeFavoriteKey(token.address), token);
        }
        setFavoriteTokensByAddress(next);
        persistFavoriteTokens(address, favoriteSet, next);
      } catch {
        setFavoriteTokensByAddress(base);
      }
    },
    [address]
  );

  useEffect(() => {
    if (!address) {
      setFavorites(new Set());
      setFavoriteTokensByAddress(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;
    let bootstrapped = false;
    let localTokenMap = new Map<string, TokenListItem>();

    if (useLocalFirstReads()) {
      const localAddresses = getLocalFavorites(address);
      if (localAddresses?.length) {
        setFavorites(new Set(localAddresses));
      }
      const localTokens = getLocalFavoriteTokens(address);
      if (localTokens?.length) {
        localTokenMap = tokensMapFromList(localTokens as TokenListItem[]);
        setFavoriteTokensByAddress(localTokenMap);
      }
    }

    setLoading(true);

    const unsub = subscribeUserBootstrap(address, (data) => {
      if (cancelled) return;
      bootstrapped = true;
      const next = new Set(data.favorites.map((item) => item.toLowerCase()));
      setFavorites(next);
      if (useLocalFirstReads()) {
        setLocalFavorites(address, [...next]);
      }
      setLoading(false);
      void reconcileFavoriteTokens(next, localTokenMap);
    });

    const fallback = window.setTimeout(() => {
      if (cancelled || bootstrapped) return;
      void (async () => {
        try {
          const response = await fetch(`/api/favorites?address=${encodeURIComponent(address)}`, {
            cache: "no-store",
          });
          const body = (await response.json()) as { data?: string[]; error?: string };
          if (!cancelled && response.ok && Array.isArray(body.data)) {
            const next = new Set(body.data.map((item) => item.toLowerCase()));
            setFavorites(next);
            if (useLocalFirstReads()) {
              setLocalFavorites(address, [...next]);
            }
            void reconcileFavoriteTokens(next, localTokenMap);
          }
        } catch {
          // ignore fetch errors
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 2_000);

    return () => {
      cancelled = true;
      unsub();
      window.clearTimeout(fallback);
    };
  }, [address, reconcileFavoriteTokens]);

  const isFavorite = useCallback(
    (tokenAddress: string) => favorites.has(normalizeFavoriteKey(tokenAddress)),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (tokenAddress: string, snapshot?: TokenListItem) => {
      if (!isConnected || !address) {
        if (openConnectModal) openConnectModal();
        return;
      }

      const key = normalizeFavoriteKey(tokenAddress);
      if (pendingRef.current.has(key)) return;

      const wasFavorite = favorites.has(key);
      pendingRef.current.add(key);

      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(key);
        else next.add(key);
        return next;
      });

      setFavoriteTokensByAddress((prev) => {
        const next = new Map(prev);
        const nextFavorites = new Set(favorites);
        if (wasFavorite) {
          next.delete(key);
          nextFavorites.delete(key);
        } else {
          nextFavorites.add(key);
          if (snapshot) next.set(key, snapshot);
        }
        if (useLocalFirstReads()) {
          setLocalFavorites(address, [...nextFavorites]);
          persistFavoriteTokens(address, nextFavorites, next);
        }
        return next;
      });

      void (async () => {
        try {
          const response = await fetch("/api/favorites/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, tokenAddress: key }),
          });
          const body = (await response.json()) as { data?: { favorited?: boolean }; error?: string };
          if (!response.ok) {
            throw new Error(body.error ?? "Failed to update favorite");
          }

          const favorited = Boolean(body.data?.favorited);
          setFavorites((prev) => {
            const next = new Set(prev);
            if (favorited) next.add(key);
            else next.delete(key);
            if (useLocalFirstReads()) {
              setLocalFavorites(address, [...next]);
            }
            if (favorited && !snapshot) {
              void reconcileFavoriteTokens(next);
            }
            return next;
          });
        } catch {
          setFavorites((prev) => {
            const next = new Set(prev);
            if (wasFavorite) next.add(key);
            else next.delete(key);
            return next;
          });
          setFavoriteTokensByAddress((prev) => {
            const next = new Map(prev);
            if (wasFavorite && snapshot) next.set(key, snapshot);
            else if (!wasFavorite) next.delete(key);
            return next;
          });
        } finally {
          pendingRef.current.delete(key);
        }
      })();
    },
    [address, isConnected, favorites, openConnectModal, reconcileFavoriteTokens]
  );

  const value = useMemo(
    () => ({
      favorites,
      favoriteTokens,
      isFavorite,
      toggleFavorite,
      upsertFavoriteSnapshots,
      loading,
    }),
    [favorites, favoriteTokens, isFavorite, toggleFavorite, upsertFavoriteSnapshots, loading]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return context;
}

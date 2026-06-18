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
import { subscribeUserBootstrap } from "@/lib/user-bootstrap";
import { useLocalFirstReads } from "@/lib/local-first/flags";
import { getLocalFavorites, setLocalFavorites } from "@/lib/local-first/user-local-store";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount } from "wagmi";

type FavoritesContextValue = {
  favorites: Set<string>;
  isFavorite: (tokenAddress: string) => boolean;
  toggleFavorite: (tokenAddress: string) => void;
  loading: boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!address) {
      setFavorites(new Set());
      return;
    }

    let cancelled = false;
    let bootstrapped = false;

    if (useLocalFirstReads()) {
      const local = getLocalFavorites(address);
      if (local?.length) {
        setFavorites(new Set(local));
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
  }, [address]);

  const isFavorite = useCallback(
    (tokenAddress: string) => favorites.has(tokenAddress.toLowerCase()),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (tokenAddress: string) => {
      if (!isConnected || !address) {
        if (openConnectModal) openConnectModal();
        return;
      }

      const key = tokenAddress.toLowerCase();
      if (pendingRef.current.has(key)) return;

      const wasFavorite = favorites.has(key);
      pendingRef.current.add(key);

      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(key);
        else next.add(key);
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
            if (useLocalFirstReads() && address) {
              setLocalFavorites(address, [...next]);
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
        } finally {
          pendingRef.current.delete(key);
        }
      })();
    },
    [address, isConnected, favorites, openConnectModal]
  );

  const value = useMemo(
    () => ({ favorites, isFavorite, toggleFavorite, loading }),
    [favorites, isFavorite, toggleFavorite, loading]
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

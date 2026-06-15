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
    setLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/favorites?address=${encodeURIComponent(address)}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as { data?: string[]; error?: string };
        if (!cancelled && response.ok && Array.isArray(body.data)) {
          setFavorites(new Set(body.data.map((item) => item.toLowerCase())));
        }
      } catch {
        // ignore fetch errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
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

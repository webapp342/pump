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

type CreatorFollowsContextValue = {
  follows: Set<string>;
  isFollowing: (creatorAddress: string) => boolean;
  toggleFollow: (creatorAddress: string) => void;
  loading: boolean;
};

const CreatorFollowsContext = createContext<CreatorFollowsContextValue | null>(null);

export function CreatorFollowsProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();
  const [follows, setFollows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!address) {
      setFollows(new Set());
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const response = await fetch(
          `/api/creators/follows?address=${encodeURIComponent(address)}`,
          { cache: "no-store" }
        );
        const body = (await response.json()) as { data?: string[]; error?: string };
        if (!cancelled && response.ok && Array.isArray(body.data)) {
          setFollows(new Set(body.data.map((item) => item.toLowerCase())));
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

  const isFollowing = useCallback(
    (creatorAddress: string) => follows.has(creatorAddress.toLowerCase()),
    [follows]
  );

  const toggleFollow = useCallback(
    (creatorAddress: string) => {
      if (!isConnected || !address) {
        if (openConnectModal) openConnectModal();
        return;
      }

      const key = creatorAddress.toLowerCase();
      if (key === address.toLowerCase()) return;
      if (pendingRef.current.has(key)) return;

      const wasFollowing = follows.has(key);
      pendingRef.current.add(key);

      setFollows((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.delete(key);
        else next.add(key);
        return next;
      });

      void (async () => {
        try {
          const response = await fetch("/api/creators/follow/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, creatorAddress: key }),
          });
          const body = (await response.json()) as { data?: { following?: boolean }; error?: string };
          if (!response.ok) {
            throw new Error(body.error ?? "Failed to update follow");
          }

          const following = Boolean(body.data?.following);
          setFollows((prev) => {
            const next = new Set(prev);
            if (following) next.add(key);
            else next.delete(key);
            return next;
          });
        } catch {
          setFollows((prev) => {
            const next = new Set(prev);
            if (wasFollowing) next.add(key);
            else next.delete(key);
            return next;
          });
        } finally {
          pendingRef.current.delete(key);
        }
      })();
    },
    [address, isConnected, follows, openConnectModal]
  );

  const value = useMemo(
    () => ({ follows, isFollowing, toggleFollow, loading }),
    [follows, isFollowing, toggleFollow, loading]
  );

  return (
    <CreatorFollowsContext.Provider value={value}>{children}</CreatorFollowsContext.Provider>
  );
}

export function useCreatorFollows() {
  const context = useContext(CreatorFollowsContext);
  if (!context) {
    throw new Error("useCreatorFollows must be used within CreatorFollowsProvider");
  }
  return context;
}

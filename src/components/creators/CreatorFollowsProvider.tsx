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
import { normalizeAddressParam } from "@/lib/address";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount } from "wagmi";

type CreatorFollowsContextValue = {
  follows: Set<string>;
  isFollowing: (creatorAddress: string) => boolean;
  toggleFollow: (followeeAddress: string) => void;
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
    let bootstrapped = false;
    setLoading(true);

    const unsub = subscribeUserBootstrap(address, (data) => {
      if (cancelled) return;
      bootstrapped = true;
      setFollows(new Set(data.creatorFollows));
      setLoading(false);
    });

    const fallback = window.setTimeout(() => {
      if (cancelled || bootstrapped) return;
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
    }, 2_000);

    return () => {
      cancelled = true;
      unsub();
      window.clearTimeout(fallback);
    };
  }, [address]);

  const isFollowing = useCallback(
    (creatorAddress: string) => follows.has(creatorAddress.toLowerCase()),
    [follows]
  );

  const toggleFollow = useCallback(
    (followeeAddress: string) => {
      if (!isConnected || !address) {
        if (openConnectModal) openConnectModal();
        return;
      }

      const follower = normalizeAddressParam(address);
      const followee = normalizeAddressParam(followeeAddress);
      if (!follower || !followee) return;
      if (followee === follower) return;

      const key = followee;
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
            body: JSON.stringify({
              address: follower,
              creatorAddress: followee,
            }),
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

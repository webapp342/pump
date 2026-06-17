"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAccount } from "wagmi";
import { subscribeUserBootstrap } from "@/lib/user-bootstrap";
import type { UserAvatarId } from "@/lib/user-avatars";

type UserAvatarContextValue = {
  avatarId: UserAvatarId | null;
  loading: boolean;
  refresh: () => Promise<void>;
  updateAvatar: (avatarId: UserAvatarId) => Promise<void>;
};

const UserAvatarContext = createContext<UserAvatarContextValue | null>(null);

export function UserAvatarProvider({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const [avatarId, setAvatarId] = useState<UserAvatarId | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) {
      setAvatarId(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/user/avatar?address=${encodeURIComponent(address)}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as { data?: { avatarId?: UserAvatarId } };
      if (response.ok && body.data?.avatarId) {
        setAvatarId(body.data.avatarId);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setAvatarId(null);
      return;
    }

    let cancelled = false;
    let bootstrapped = false;

    const unsub = subscribeUserBootstrap(address, (data) => {
      if (cancelled) return;
      bootstrapped = true;
      if (data.avatarId) setAvatarId(data.avatarId);
      setLoading(false);
    });

    const fallback = window.setTimeout(() => {
      if (cancelled || bootstrapped) return;
      void refresh();
    }, 2_000);

    return () => {
      cancelled = true;
      unsub();
      window.clearTimeout(fallback);
    };
  }, [address, refresh]);

  const updateAvatar = useCallback(
    async (nextId: UserAvatarId) => {
      if (!address) return;

      const previous = avatarId;
      setAvatarId(nextId);

      try {
        const response = await fetch("/api/user/avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, avatarId: nextId }),
        });
        const body = (await response.json()) as { data?: { avatarId?: UserAvatarId }; error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Failed to update avatar");
        }
        if (body.data?.avatarId) setAvatarId(body.data.avatarId);
      } catch {
        setAvatarId(previous);
        throw new Error("Failed to update avatar");
      }
    },
    [address, avatarId]
  );

  const value = useMemo(
    () => ({ avatarId, loading, refresh, updateAvatar }),
    [avatarId, loading, refresh, updateAvatar]
  );

  return <UserAvatarContext.Provider value={value}>{children}</UserAvatarContext.Provider>;
}

export function useUserAvatar() {
  const context = useContext(UserAvatarContext);
  if (!context) {
    throw new Error("useUserAvatar must be used within UserAvatarProvider");
  }
  return context;
}

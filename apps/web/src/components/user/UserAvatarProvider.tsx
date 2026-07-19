"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { subscribeUserBootstrap } from "@/lib/user-bootstrap";
import type { UserAvatarId } from "@/lib/user-avatars";
import { resolveDisplayUsername } from "@/lib/username";
import { invalidateDisplayNameCache } from "@/hooks/useUserDisplayNames";

type UserAvatarContextValue = {
  avatarId: UserAvatarId | null;
  username: string | null;
  displayUsername: string | null;
  hasStatusBadge: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  updateAvatar: (avatarId: UserAvatarId) => Promise<void>;
  updateProfile: (input: {
    avatarId?: UserAvatarId;
    username?: string | null;
  }) => Promise<void>;
  /** Optimistic after redeeming Profile frame. */
  setHasStatusBadge: (value: boolean) => void;
};

const UserAvatarContext = createContext<UserAvatarContextValue | null>(null);

export function UserAvatarProvider({ children }: { children: React.ReactNode }) {
  const { address } = useActiveWalletAddress();
  const [avatarId, setAvatarId] = useState<UserAvatarId | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [hasStatusBadge, setHasStatusBadge] = useState(false);
  const [loading, setLoading] = useState(false);

  const displayUsername = useMemo(() => {
    if (!address) return null;
    return resolveDisplayUsername(address, username);
  }, [address, username]);

  const applyProfile = useCallback(
    (next: {
      avatarId?: UserAvatarId | null;
      username?: string | null;
      hasStatusBadge?: boolean;
    }) => {
      if (next.avatarId) setAvatarId(next.avatarId);
      if (next.username !== undefined) setUsername(next.username);
      if (next.hasStatusBadge !== undefined) setHasStatusBadge(next.hasStatusBadge);
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!address) {
      setAvatarId(null);
      setUsername(null);
      setHasStatusBadge(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/user/profile?address=${encodeURIComponent(address)}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as {
        data?: {
          avatarId?: UserAvatarId;
          username?: string | null;
          hasStatusBadge?: boolean;
        };
      };
      if (response.ok && body.data) {
        if (body.data.avatarId) setAvatarId(body.data.avatarId);
        setUsername(body.data.username ?? null);
        setHasStatusBadge(Boolean(body.data.hasStatusBadge));
        invalidateDisplayNameCache(address);
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
      setUsername(null);
      setHasStatusBadge(false);
      return;
    }

    let cancelled = false;
    let bootstrapped = false;

    const unsub = subscribeUserBootstrap(address, (data) => {
      if (cancelled) return;
      bootstrapped = true;
      applyProfile({
        avatarId: data.avatarId,
        username: data.username,
        hasStatusBadge: Boolean(data.hasStatusBadge),
      });
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
  }, [address, applyProfile, refresh]);

  const updateProfile = useCallback(
    async (input: { avatarId?: UserAvatarId; username?: string | null }) => {
      if (!address) return;

      const previous = { avatarId, username };
      applyProfile({
        avatarId: input.avatarId ?? avatarId,
        username: input.username !== undefined ? input.username : username,
      });

      try {
        const response = await fetch("/api/user/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, ...input }),
        });
        const body = (await response.json()) as {
          data?: { avatarId?: UserAvatarId; username?: string | null };
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Failed to update profile");
        }
        if (body.data) {
          applyProfile({
            avatarId: body.data.avatarId,
            username: body.data.username ?? null,
          });
        }
      } catch (error) {
        setAvatarId(previous.avatarId);
        setUsername(previous.username);
        throw error;
      }
    },
    [address, applyProfile, avatarId, username]
  );

  const updateAvatar = useCallback(
    async (nextId: UserAvatarId) => {
      await updateProfile({ avatarId: nextId });
    },
    [updateProfile]
  );

  const value = useMemo(
    () => ({
      avatarId,
      username,
      displayUsername,
      hasStatusBadge,
      loading,
      refresh,
      updateAvatar,
      updateProfile,
      setHasStatusBadge,
    }),
    [
      avatarId,
      username,
      displayUsername,
      hasStatusBadge,
      loading,
      refresh,
      updateAvatar,
      updateProfile,
    ]
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

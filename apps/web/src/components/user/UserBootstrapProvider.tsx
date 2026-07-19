"use client";

import { useEffect } from "react";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import {
  clearUserBootstrap,
  setUserBootstrap,
  type UserBootstrapData,
} from "@/lib/user-bootstrap";
import type { UserAvatarId } from "@/lib/user-avatars";

/** One round-trip for favorites, airdrop saves, follows, and avatar on wallet connect. */
export function UserBootstrapProvider({ children }: { children: React.ReactNode }) {
  const { address } = useActiveWalletAddress();

  useEffect(() => {
    if (!address) {
      clearUserBootstrap();
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/user/bootstrap?address=${encodeURIComponent(address)}`,
          { cache: "no-store" }
        );
        const body = (await response.json()) as {
          data?: {
            address: string;
            favorites?: string[];
            airdropSaves?: string[];
            creatorFollows?: string[];
            avatarId?: UserAvatarId | null;
            username?: string | null;
            hasStatusBadge?: boolean;
          };
        };
        if (cancelled || !response.ok || !body.data) return;

        const payload: UserBootstrapData = {
          address: body.data.address,
          favorites: body.data.favorites ?? [],
          airdropSaves: body.data.airdropSaves ?? [],
          creatorFollows: (body.data.creatorFollows ?? []).map((item) => item.toLowerCase()),
          avatarId: body.data.avatarId ?? null,
          username: body.data.username ?? null,
          hasStatusBadge: Boolean(body.data.hasStatusBadge),
        };
        setUserBootstrap(payload);
      } catch {
        // Providers fall back to individual endpoints.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  return children;
}

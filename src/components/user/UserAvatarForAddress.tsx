"use client";

import { useEffect, useState } from "react";
import type { UserAvatarId } from "@/lib/user-avatars";
import { UserAvatar } from "@/components/user/UserAvatar";

const avatarIdCache = new Map<string, UserAvatarId>();

type UserAvatarForAddressProps = {
  address: string;
  size?: number;
  className?: string;
};

export function UserAvatarForAddress({
  address,
  size = 40,
  className = "",
}: UserAvatarForAddressProps) {
  const normalized = address.toLowerCase();
  const [avatarId, setAvatarId] = useState<UserAvatarId | null>(
    () => avatarIdCache.get(normalized) ?? null
  );

  useEffect(() => {
    const cached = avatarIdCache.get(normalized);
    if (cached) {
      setAvatarId(cached);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/user/avatar?address=${encodeURIComponent(normalized)}`,
          { cache: "no-store" }
        );
        const body = (await response.json()) as { data?: { avatarId?: UserAvatarId } };
        if (!cancelled && response.ok && body.data?.avatarId) {
          avatarIdCache.set(normalized, body.data.avatarId);
          setAvatarId(body.data.avatarId);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [normalized]);

  if (!avatarId) {
    return (
      <span
        className={`skeleton-shimmer inline-block shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <UserAvatar address={address} avatarId={avatarId} size={size} className={className} />
  );
}

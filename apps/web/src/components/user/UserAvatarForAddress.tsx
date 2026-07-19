"use client";

import { useEffect, useState } from "react";
import type { UserAvatarId } from "@/lib/user-avatars";
import { UserAvatar } from "@/components/user/UserAvatar";
import { fetchUserAvatarId, getCachedUserAvatarId } from "@/lib/user-avatar-cache";
import { addressCacheKey } from "@/lib/address";
import { USER_AVATAR_SIZE, type UserAvatarSizeRole } from "@/lib/ui-sizes";
import { useUserDisplayNames } from "@/hooks/useUserDisplayNames";

type UserAvatarForAddressProps = {
  address: string;
  /** Named role or px. Prefer `USER_AVATAR_SIZE` roles. Default: `2xl` (40). */
  size?: number | UserAvatarSizeRole;
  className?: string;
  /**
   * Premium profile frame. When omitted, resolves from display-names / inventory cache.
   */
  framed?: boolean;
};

function resolveAvatarPx(size: number | UserAvatarSizeRole | undefined): number {
  if (size == null) return USER_AVATAR_SIZE["2xl"];
  if (typeof size === "number") return size;
  return USER_AVATAR_SIZE[size];
}

export function UserAvatarForAddress({
  address,
  size = "2xl",
  className = "",
  framed,
}: UserAvatarForAddressProps) {
  const cacheKey = addressCacheKey(address) ?? address;
  const px = resolveAvatarPx(size);
  const [avatarId, setAvatarId] = useState<UserAvatarId | null>(
    () => getCachedUserAvatarId(cacheKey)
  );

  const badgeLookup = useUserDisplayNames(framed === undefined ? [address] : [], true);
  const resolvedFramed =
    framed ?? Boolean(badgeLookup.get(cacheKey)?.hasStatusBadge);

  useEffect(() => {
    const cached = getCachedUserAvatarId(cacheKey);
    if (cached) {
      setAvatarId(cached);
      return;
    }

    let cancelled = false;
    void fetchUserAvatarId(cacheKey).then((next) => {
      if (!cancelled && next) setAvatarId(next);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  if (!avatarId) {
    return (
      <span
        className={`skeleton-shimmer inline-block shrink-0 rounded-full ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <UserAvatar
      address={address}
      avatarId={avatarId}
      size={px}
      className={className}
      framed={resolvedFramed}
    />
  );
}

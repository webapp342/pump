"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { getDiceBearStyle } from "@/lib/dicebear-styles";
import {
  USER_AVATAR_BG_COLORS,
  resolveUserAvatarId,
} from "@/lib/user-avatars";

import { USER_AVATAR_SIZE, type UserAvatarSizeRole } from "@/lib/ui-sizes";

type UserAvatarProps = {
  address: string;
  avatarId: string;
  /** Named role or px. Prefer `USER_AVATAR_SIZE` roles. Default: `2xl` (40). */
  size?: number | UserAvatarSizeRole;
  className?: string;
  selected?: boolean;
};

function resolveAvatarPx(size: number | UserAvatarSizeRole | undefined): number {
  if (size == null) return USER_AVATAR_SIZE["2xl"];
  if (typeof size === "number") return size;
  return USER_AVATAR_SIZE[size];
}

export function UserAvatar({
  address,
  avatarId,
  size = "2xl",
  className = "",
  selected = false,
}: UserAvatarProps) {
  const variant = resolveUserAvatarId(avatarId);
  const seed = address.toLowerCase();
  const px = resolveAvatarPx(size);

  const src = useMemo(() => {
    return createAvatar(getDiceBearStyle(variant), {
      seed,
      size: px,
      backgroundColor: USER_AVATAR_BG_COLORS,
      backgroundType: ["solid"],
    }).toDataUri();
  }, [variant, seed, px]);

  return (
    <img
      src={src}
      alt=""
      width={px}
      height={px}
      className={`inline-block shrink-0 rounded-full bg-pump-surface/40 object-cover shadow-sm ring-2 ${
        selected ? "ring-pump-accent" : "ring-pump-border/20"
      } ${className}`}
    />
  );
}

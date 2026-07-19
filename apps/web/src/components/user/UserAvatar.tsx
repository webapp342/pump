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
  /** Profile perk — premium ring frame around the avatar. */
  framed?: boolean;
};

function resolveAvatarPx(size: number | UserAvatarSizeRole | undefined): number {
  if (size == null) return USER_AVATAR_SIZE["2xl"];
  if (typeof size === "number") return size;
  return USER_AVATAR_SIZE[size];
}

/** Ring thickness drawn *inside* the same outer box (does not grow layout). */
function frameRingPx(avatarPx: number): number {
  if (avatarPx <= 20) return 1.5;
  if (avatarPx <= 32) return 2;
  if (avatarPx <= 48) return 2.5;
  return 3;
}

export function UserAvatar({
  address,
  avatarId,
  size = "2xl",
  className = "",
  selected = false,
  framed = false,
}: UserAvatarProps) {
  const variant = resolveUserAvatarId(avatarId);
  const seed = address.toLowerCase();
  const px = resolveAvatarPx(size);
  const ring = framed ? frameRingPx(px) : 0;
  const innerPx = framed ? Math.max(px - ring * 2, 1) : px;

  const src = useMemo(() => {
    return createAvatar(getDiceBearStyle(variant), {
      seed,
      size: Math.round(innerPx),
      backgroundColor: USER_AVATAR_BG_COLORS,
      backgroundType: ["solid"],
    }).toDataUri();
  }, [variant, seed, innerPx]);

  const img = (
    <img
      src={src}
      alt=""
      width={Math.round(innerPx)}
      height={Math.round(innerPx)}
      className={`user-avatar__img inline-block shrink-0 rounded-full bg-pump-surface/40 object-cover${
        framed
          ? ""
          : ` shadow-sm ring-2 ${selected ? "ring-pump-accent" : "ring-pump-border/20"}`
      }`}
      style={framed ? { width: innerPx, height: innerPx } : undefined}
    />
  );

  if (!framed) {
    return <span className={`user-avatar inline-flex shrink-0 ${className}`}>{img}</span>;
  }

  return (
    <span
      className={`user-avatar user-avatar--framed inline-flex shrink-0 items-center justify-center${
        selected ? " user-avatar--framed-selected" : ""
      }${className ? ` ${className}` : ""}`}
      style={{
        width: px,
        height: px,
        ["--user-avatar-ring" as string]: `${ring}px`,
      }}
      title="Profile frame"
      aria-label="Avatar with profile frame"
    >
      <span className="user-avatar__ring" aria-hidden />
      <span className="user-avatar__glow" aria-hidden />
      {img}
    </span>
  );
}

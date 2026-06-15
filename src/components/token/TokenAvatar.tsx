"use client";

import { useEffect, useState } from "react";
import { resolveLaunchpadLogoUri } from "@/lib/assets";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type TokenAvatarProps = {
  address: string;
  symbol: string;
  logoUrl?: string | null;
  /** Local blob/data URL shown before upload completes. */
  previewUrl?: string | null;
  size?: number;
  className?: string;
};

export function TokenAvatar({
  address,
  symbol,
  logoUrl,
  previewUrl,
  size = 40,
  className = "",
}: TokenAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const letter = symbol.charAt(0).toUpperCase() || "?";
  const isPlaceholder = address.toLowerCase() === ZERO_ADDRESS;

  const src =
    previewUrl ??
    (logoUrl?.startsWith("data:") || logoUrl?.startsWith("blob:") ? logoUrl : null) ??
    (logoUrl?.trim() ? resolveLaunchpadLogoUri(logoUrl, address) : null) ??
    (isPlaceholder ? null : resolveLaunchpadLogoUri(null, address));

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const fallback = (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-pump-border/20 bg-pump-surface/70 text-sm font-semibold text-pump-text ring-2 ring-pump-border/15 ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      {letter}
    </span>
  );

  if (!src || imgError) return fallback;

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-full object-cover ring-2 ring-pump-border/15 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setImgError(true)}
    />
  );
}

"use client";

import { useEffect, useState } from "react";
import { resolveLaunchpadLogoUri } from "@/lib/assets";
import { TOKEN_LOGO_SIZE, type TokenLogoSizeRole } from "@/lib/ui-sizes";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type TokenAvatarProps = {
  address: string;
  symbol: string;
  logoUrl?: string | null;
  /** Local blob/data URL shown before upload completes. */
  previewUrl?: string | null;
  /** Named role or px. Prefer roles from `TOKEN_LOGO_SIZE`. Default: `sm` (20). */
  size?: number | TokenLogoSizeRole;
  /** circle = user avatars only; rounded = token / chain logos (default). */
  shape?: "circle" | "rounded";
  className?: string;
};

function resolveLogoPx(size: number | TokenLogoSizeRole | undefined): number {
  if (size == null) return TOKEN_LOGO_SIZE.sm;
  if (typeof size === "number") return size;
  return TOKEN_LOGO_SIZE[size];
}

export function TokenAvatar({
  address,
  symbol,
  logoUrl,
  previewUrl,
  size = "sm",
  shape = "rounded",
  className = "",
}: TokenAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const letter = symbol.charAt(0).toUpperCase() || "?";
  const isPlaceholder = address.toLowerCase() === ZERO_ADDRESS;
  const isCircle = shape === "circle";
  const resolvedSize = resolveLogoPx(size);
  const useCssInline = !isCircle && resolvedSize === TOKEN_LOGO_SIZE.sm;
  const shapeClass = isCircle
    ? "token-avatar-circle"
    : useCssInline
      ? "token-logo-mark token-logo-mark--inline"
      : "token-logo-mark";
  const ringClass = isCircle ? "ring-2 ring-pump-border/15" : "";
  const tileStyle = useCssInline
    ? undefined
    : {
        width: resolvedSize,
        height: resolvedSize,
        minWidth: resolvedSize,
        minHeight: resolvedSize,
      };

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
      className={`flex shrink-0 items-center justify-center overflow-hidden type-label1 text-pump-text ${shapeClass} ${ringClass} ${className}`}
      style={tileStyle}
    >
      {letter}
    </span>
  );

  if (!src || imgError) return fallback;

  return (
    <img
      src={src}
      alt=""
      width={resolvedSize}
      height={resolvedSize}
      referrerPolicy="no-referrer"
      className={`shrink-0 object-cover ${shapeClass} ${ringClass} ${className}`}
      style={tileStyle}
      onError={() => setImgError(true)}
    />
  );
}

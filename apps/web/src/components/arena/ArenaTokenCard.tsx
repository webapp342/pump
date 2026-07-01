"use client";

import { useEffect, useState } from "react";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TokenDetailLink } from "@/components/token/TokenDetailLink";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { resolveLaunchpadLogoUri } from "@/lib/assets";
import { formatAge, formatCapForBoard } from "@/lib/arena-board-format";
import { PumpIcon, faBolt } from "@/lib/icons";

type FlashTone = "up" | "down";

function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

function TrendSparkline({
  points,
  positive,
  className = "",
}: {
  points: number[];
  positive: boolean;
  className?: string;
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1e-9);
  const poly = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * 72;
      const y = 22 - ((p - min) / range) * 18;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 72 24" aria-hidden className={className}>
      <polyline
        points={poly}
        fill="none"
        stroke={positive ? "rgb(var(--pump-success))" : "rgb(var(--pump-danger))"}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ArenaTokenCardProps = {
  token: TokenListItem;
  mcapUsd: number | null;
  mcapFlash?: FlashTone;
  isFavorite: boolean;
  onToggleFavorite: (address: string) => void;
  compact?: boolean;
};

export function ArenaTokenCard({
  token,
  mcapUsd,
  mcapFlash,
  isFavorite,
  onToggleFavorite,
  compact = false,
}: ArenaTokenCardProps) {
  const [imgError, setImgError] = useState(false);
  const logoSrc = token.logoUrl?.trim()
    ? resolveLaunchpadLogoUri(token.logoUrl, token.address)
    : resolveLaunchpadLogoUri(null, token.address);

  useEffect(() => {
    setImgError(false);
  }, [logoSrc]);

  const trendPoints = [
    token.change24hPct ?? 0,
    token.change6hPct ?? 0,
    token.change1hPct ?? 0,
    0,
  ];
  const trendPositive = (token.change24hPct ?? 0) >= 0;
  const mcapLabel = formatCapForBoard(mcapUsd);
  const creatorLabel =
    token.creatorDisplayUsername ??
    token.creatorUsername ?? (
      <UserDisplayName address={token.creatorAddress} compact />
    );
  const creatorAvatarSymbol =
    token.creatorDisplayUsername ??
    token.creatorUsername ??
    token.creatorAddress.slice(0, 1).toUpperCase();

  return (
    <TokenDetailLink
      address={token.address}
      className={`arena-token-card group block cursor-pointer no-underline ${
        compact ? "arena-token-card--compact" : ""
      }`}
      aria-label={`View ${token.symbol}`}
    >
      <div className="arena-token-card__media">
        {logoSrc && !imgError ? (
          <img
            src={logoSrc}
            alt=""
            className="arena-token-card__image"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="arena-token-card__image arena-token-card__image--fallback">
            <span className="text-h2 font-semibold text-pump-muted">
              {token.symbol.charAt(0).toUpperCase() || "?"}
            </span>
          </div>
        )}
        <div className="arena-token-card__sparkline" aria-hidden>
          <TrendSparkline
            points={trendPoints}
            positive={trendPositive}
            className="h-6 w-[4.5rem]"
          />
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite(token.address);
          }}
          className={`arena-token-card__favorite ${isFavorite ? "arena-token-card__favorite--active" : ""}`}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>

      <div className="arena-token-card__body">
        <p className="arena-token-card__name truncate">{token.name}</p>
        <p className="arena-token-card__symbol truncate">${token.symbol}</p>
        <p className={`arena-token-card__mcap financial-value ${flashText(mcapFlash)}`}>
          {mcapLabel === "—" ? "—" : `${mcapLabel} MC`}
        </p>
        <div className="arena-token-card__meta">
          <TokenAvatar
            address={token.creatorAddress}
            symbol={creatorAvatarSymbol}
            size={18}
            className="!ring-0"
          />
          <span className="arena-token-card__creator truncate">{creatorLabel}</span>
          <PumpIcon icon={faBolt} className="arena-token-card__age-icon shrink-0" aria-hidden />
          <span className="arena-token-card__age financial-value shrink-0">
            {formatAge(token.createdAt)}
          </span>
        </div>
      </div>
    </TokenDetailLink>
  );
}

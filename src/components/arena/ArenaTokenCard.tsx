import Link from "next/link";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { formatCapForBoard, formatSignedPct, pctTone } from "@/lib/arena-board-format";

type FlashTone = "up" | "down";

function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

function TrendSparkline({
  points,
  positive,
}: {
  points: number[];
  positive: boolean;
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1e-9);
  const poly = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * 56;
      const y = 18 - ((p - min) / range) * 16;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 56 20" aria-hidden className="h-5 w-14 shrink-0 opacity-90">
      <polyline
        points={poly}
        fill="none"
        stroke={positive ? "rgb(var(--pump-success))" : "rgb(var(--pump-danger))"}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ArenaTokenCardProps = {
  token: TokenListItem;
  mcapUsd: number | null;
  isKoth: boolean;
  isKothContender: boolean;
  mcapFlash?: FlashTone;
  isFavorite: boolean;
  onToggleFavorite: (address: string) => void;
  compact?: boolean;
};

export function ArenaTokenCard({
  token,
  mcapUsd,
  isKoth,
  isKothContender,
  mcapFlash,
  isFavorite,
  onToggleFavorite,
  compact = false,
}: ArenaTokenCardProps) {
  const trendPoints = [
    token.change24hPct ?? 0,
    token.change6hPct ?? 0,
    token.change1hPct ?? 0,
    0,
  ];
  const trendPositive = (token.change24hPct ?? 0) >= 0;
  const avatarSize = compact ? 32 : 40;

  return (
    <article
      className={`arena-token-card panel-interactive flex h-full flex-col gap-3 p-3 md:gap-4 md:p-4 ${
        compact ? "arena-token-card--compact" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/token/${token.address}`} className="flex min-w-0 items-center gap-3">
          <TokenAvatar
            address={token.address}
            symbol={token.symbol}
            logoUrl={token.logoUrl}
            size={avatarSize}
          />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-semibold text-pump-text">{token.name}</p>
            <p className="text-caption text-pump-muted">${token.symbol}</p>
          </div>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isKoth ? (
            <span className="status-badge border-pump-accent/40 bg-pump-accent/12 text-[10px] text-pump-accent">
              KOTH
            </span>
          ) : isKothContender ? (
            <span className="status-badge text-[10px] text-pump-muted">Contender</span>
          ) : null}
          <button
            type="button"
            onClick={() => onToggleFavorite(token.address)}
            className={`text-lg leading-none transition ${
              isFavorite ? "text-pump-accent" : "text-pump-muted hover:text-pump-text"
            }`}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="min-w-0 space-y-1">
          <p className="section-label">Market cap</p>
          <p
            className={`financial-value text-h3 font-semibold leading-none text-pump-text ${flashText(mcapFlash)}`}
          >
            {formatCapForBoard(mcapUsd)}
          </p>
          <p className={`financial-value text-caption font-medium ${pctTone(token.change24hPct ?? null)}`}>
            {formatSignedPct(token.change24hPct ?? null)} 24h
          </p>
        </div>
        <TrendSparkline points={trendPoints} positive={trendPositive} />
      </div>
    </article>
  );
}

"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { bnbToUsd } from "@/lib/format-usd";
import { PctChange } from "@/components/ui/PctChange";
import { formatCapForBoard } from "@/lib/arena-board-format";
import { PumpIcon, faStarSolid } from "@/lib/icons";

type FlashTone = "up" | "down";

function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

export type WatchlistContentProps = {
  tokens: TokenListItem[];
  bnbUsd: number | null;
  flashes: Record<string, FlashTone>;
  animatedCaps: Record<string, number>;
};

export function useWatchlistTokens(tokens: TokenListItem[]) {
  const { favorites } = useFavorites();

  return [...favorites]
    .map((address) => tokens.find((token) => token.address.toLowerCase() === address))
    .filter((token): token is TokenListItem => token != null);
}

export function WatchlistContent({
  tokens,
  bnbUsd,
  flashes,
  animatedCaps,
}: WatchlistContentProps) {
  const { toggleFavorite, loading } = useFavorites();
  const { isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();
  const watchlistTokens = useWatchlistTokens(tokens);

  if (!isConnected) {
    return (
      <div className="empty-state px-3 py-6">
        <p className="empty-state-copy text-caption">
          Connect wallet to sync starred tokens across devices.
        </p>
        <button
          type="button"
          onClick={() => openConnectModal?.()}
          className="secondary-button mt-3 w-full text-caption"
        >
          Connect
        </button>
      </div>
    );
  }

  if (loading) {
    return <p className="p-4 text-center text-caption text-pump-muted">Loading…</p>;
  }

  if (watchlistTokens.length === 0) {
    return (
      <div className="empty-state px-3 py-6">
        <p className="empty-state-copy text-caption">
          Star tokens in the Arena to pin them here.
        </p>
      </div>
    );
  }

  return (
    <ul className="toolbar-sheet-list">
      {watchlistTokens.map((token) => {
        const addressKey = token.address.toLowerCase();
        const mcapUsd =
          animatedCaps[`${addressKey}:cap:mcap`] ??
          bnbToUsd(Number(token.marketCapBnb), bnbUsd);
        const symbolLabel = `$${token.symbol}`;

        return (
          <li key={token.address}>
            <div className="toolbar-sheet-row">
              <button
                type="button"
                onClick={() => toggleFavorite(token.address, token)}
                className="toolbar-sheet-row__action text-pump-accent"
                aria-label="Remove from watchlist"
              >
                <PumpIcon icon={faStarSolid} className="h-3.5 w-3.5" />
              </button>
              <Link href={`/token/${token.address}`} className="toolbar-sheet-row__main">
                <TokenAvatar
                  address={token.address}
                  symbol={token.symbol}
                  logoUrl={token.logoUrl}
                  size={28}
                  className="toolbar-sheet-row__avatar"
                />
                <span className="toolbar-sheet-row__symbol">{symbolLabel}</span>
                <span className="toolbar-sheet-row__metric">
                  <span className="toolbar-sheet-row__metric-label">MC</span>
                  <span
                    className={`financial-value toolbar-sheet-row__metric-value ${flashText(
                      flashes[`${addressKey}:mcap`]
                    )}`}
                  >
                    {formatCapForBoard(mcapUsd)}
                  </span>
                </span>
                <PctChange
                  value={token.change24hPct ?? null}
                  className="toolbar-sheet-row__pct"
                />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function WatchlistCountBadge({ tokens }: { tokens: TokenListItem[] }) {
  const watchlistTokens = useWatchlistTokens(tokens);
  if (watchlistTokens.length === 0) return null;
  return (
    <span className="financial-value text-caption text-pump-muted">({watchlistTokens.length})</span>
  );
}

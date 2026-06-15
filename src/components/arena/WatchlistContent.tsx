"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { bnbToUsd } from "@/lib/format-usd";
import { formatCapForBoard, formatSignedPct, pctTone } from "@/lib/arena-board-format";
import { buildTokenTradeUrl } from "@/lib/token-trade-prefill";

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
  showTradeActions?: boolean;
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
  showTradeActions = true,
}: WatchlistContentProps) {
  const { favorites, toggleFavorite, loading } = useFavorites();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const watchlistTokens = useWatchlistTokens(tokens);

  if (!isConnected) {
    return (
      <div className="empty-state px-2 py-4">
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
    return <p className="p-3 text-center text-caption text-pump-muted">Loading…</p>;
  }

  if (watchlistTokens.length === 0) {
    return (
      <div className="empty-state px-2 py-4">
        <p className="empty-state-copy text-caption">
          Star tokens in the Arena to pin them here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {watchlistTokens.map((token) => {
        const addressKey = token.address.toLowerCase();
        const mcapUsd =
          animatedCaps[`${addressKey}:cap:mcap`] ??
          bnbToUsd(Number(token.marketCapBnb), bnbUsd);

        return (
          <li key={token.address}>
            <div className="arena-watchlist-item group">
              <Link href={`/token/${token.address}`} className="flex min-w-0 flex-1 items-center gap-2">
                <TokenAvatar
                  address={token.address}
                  symbol={token.symbol}
                  logoUrl={token.logoUrl}
                  size={24}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption font-medium text-pump-text">${token.symbol}</p>
                  <p
                    className={`financial-value text-[10px] font-semibold ${flashText(
                      flashes[`${addressKey}:mcap`]
                    )}`}
                  >
                    {formatCapForBoard(mcapUsd)}
                  </p>
                </div>
                <span
                  className={`financial-value shrink-0 text-[10px] font-medium ${pctTone(
                    token.change24hPct ?? null
                  )}`}
                >
                  {formatSignedPct(token.change24hPct ?? null)}
                </span>
              </Link>
              {showTradeActions ? (
                <Link
                  href={buildTokenTradeUrl(token.address)}
                  className="secondary-button shrink-0 px-2 py-0.5 text-[10px] font-semibold"
                  onClick={(event) => event.stopPropagation()}
                >
                  Trade
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => toggleFavorite(token.address)}
                className="shrink-0 text-sm leading-none text-pump-accent opacity-70 transition hover:opacity-100 xl:opacity-0 xl:group-hover:opacity-100"
                aria-label="Remove from watchlist"
              >
                ★
              </button>
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

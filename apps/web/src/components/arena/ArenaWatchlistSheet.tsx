"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useAccount } from "wagmi";
import type { TokenListItem } from "@/lib/db/launchpad";
import { ToolbarSheet } from "@/components/ui/ToolbarSheet";
import { ICON_STROKE } from "@/lib/icons";
import { WatchlistContent, useWatchlistTokens } from "@/components/arena/WatchlistContent";
import { useFavorites } from "@/components/favorites/FavoritesProvider";

type FlashTone = "up" | "down";

type ArenaWatchlistSheetProps = {
  tokens: TokenListItem[];
  bnbUsd: number | null;
  flashes: Record<string, FlashTone>;
};

export function ArenaWatchlistSheet({
  tokens,
  bnbUsd,
  flashes,
}: ArenaWatchlistSheetProps) {
  const [open, setOpen] = useState(false);
  const { isConnected } = useAccount();
  const { favorites } = useFavorites();
  const watchlistTokens = useWatchlistTokens(tokens);
  const watchlistCount = isConnected ? favorites.size : watchlistTokens.length;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const ariaLabel = `Open watchlist${watchlistCount > 0 ? `, ${watchlistCount} tokens` : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="arena-watchlist-btn toolbar-btn shrink-0 md:hidden"
        aria-label={ariaLabel}
      >
        <Star className="h-3.5 w-3.5 shrink-0 text-pump-accent" strokeWidth={ICON_STROKE} aria-hidden />
        <span className="arena-watchlist-btn__label text-caption">Watchlist</span>
        {watchlistCount > 0 ? (
          <span className="arena-watchlist-btn__count financial-value text-caption text-pump-muted">
            ({watchlistCount})
          </span>
        ) : null}
      </button>

      <ToolbarSheet
        open={open}
        onClose={close}
        ariaLabel="Watchlist"
        title="Watchlist"
        count={watchlistCount}
        icon={<Star className="h-4 w-4 text-pump-accent" strokeWidth={ICON_STROKE} />}
      >
        <WatchlistContent
          tokens={tokens}
          bnbUsd={bnbUsd}
          flashes={flashes}
        />
      </ToolbarSheet>
    </>
  );
}

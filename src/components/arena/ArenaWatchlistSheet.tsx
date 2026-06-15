"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import type { TokenListItem } from "@/lib/db/launchpad";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { ICON_STROKE } from "@/lib/icons";
import {
  WatchlistContent,
  WatchlistCountBadge,
  useWatchlistTokens,
} from "@/components/arena/WatchlistContent";
import { useFavorites } from "@/components/favorites/FavoritesProvider";

type FlashTone = "up" | "down";

type ArenaWatchlistSheetProps = {
  tokens: TokenListItem[];
  bnbUsd: number | null;
  flashes: Record<string, FlashTone>;
  animatedCaps: Record<string, number>;
};

export function ArenaWatchlistSheet({
  tokens,
  bnbUsd,
  flashes,
  animatedCaps,
}: ArenaWatchlistSheetProps) {
  const [open, setOpen] = useState(false);
  const { favorites } = useFavorites();
  const watchlistTokens = useWatchlistTokens(tokens);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const ariaLabel = `Open watchlist${favorites.size > 0 ? `, ${favorites.size} tokens` : ""}`;

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
        {watchlistTokens.length > 0 ? (
          <span className="arena-watchlist-btn__count financial-value text-caption text-pump-muted">
            ({watchlistTokens.length})
          </span>
        ) : null}
      </button>

      <ModalPortal open={open}>
        <div
          className="modal-backdrop modal-backdrop-shell z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Watchlist"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close watchlist"
            onClick={close}
          />
          <div className="modal-panel pointer-events-auto relative flex max-h-[min(80vh,32rem)] w-full max-w-lg flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-pump-border/30 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-pump-accent" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="section-heading text-body-sm">Watchlist</span>
                <WatchlistCountBadge tokens={tokens} />
              </div>
              <button
                type="button"
                onClick={close}
                className="toolbar-btn !w-8 !px-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <WatchlistContent
                tokens={tokens}
                bnbUsd={bnbUsd}
                flashes={flashes}
                animatedCaps={animatedCaps}
              />
            </div>
          </div>
        </div>
      </ModalPortal>
    </>
  );
}

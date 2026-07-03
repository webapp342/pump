"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { TokenListItem } from "@/lib/db/launchpad";
import { ToolbarSheet } from "@/components/ui/ToolbarSheet";
import { PumpIcon, faStarSolid } from "@/lib/icons";
import { WatchlistContent, useWatchlistTokens } from "@/components/arena/WatchlistContent";
import { useFavorites } from "@/components/favorites/FavoritesProvider";

type FlashTone = "up" | "down";

type ArenaWatchlistSheetProps = {
  tokens: TokenListItem[];
  bnbUsd: number | null;
  flashes: Record<string, FlashTone>;
  animatedCaps: Record<string, number>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ArenaWatchlistSheet({
  tokens,
  bnbUsd,
  flashes,
  animatedCaps,
  open: openProp,
  onOpenChange,
}: ArenaWatchlistSheetProps) {
  const [openUncontrolled, setOpenUncontrolled] = useState(false);
  const open = openProp ?? openUncontrolled;
  const { isConnected } = useAccount();
  const { favorites } = useFavorites();
  const watchlistTokens = useWatchlistTokens(tokens);
  const watchlistCount = isConnected ? favorites.size : watchlistTokens.length;

  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      else setOpenUncontrolled(next);
    },
    [onOpenChange]
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  return (
    <ToolbarSheet
      open={open}
      onClose={close}
      ariaLabel="Watchlist"
      title="Watchlist"
      count={watchlistCount}
      icon={<PumpIcon icon={faStarSolid} className="h-4 w-4 text-pump-accent" />}
    >
      <WatchlistContent
        tokens={tokens}
        bnbUsd={bnbUsd}
        flashes={flashes}
        animatedCaps={animatedCaps}
      />
    </ToolbarSheet>
  );
}

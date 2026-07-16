"use client";

import { useCallback, useEffect, useState } from "react";
import type { TokenListItem } from "@/lib/db/launchpad";
import { PumpIcon, faChevronLeft, faChevronRight, faStarRegular } from "@/lib/icons";
import {
  readWatchlistPanelCollapsed,
  writeWatchlistPanelCollapsed,
} from "@/lib/arena-watchlist-panel";
import { WatchlistContent, useWatchlistTokens } from "@/components/arena/WatchlistContent";

type FlashTone = "up" | "down";

type ArenaWatchlistPanelProps = {
  tokens: TokenListItem[];
  bnbUsd: number | null;
  flashes: Record<string, FlashTone>;
  animatedCaps: Record<string, number>;
};

export function ArenaWatchlistPanel({
  tokens,
  bnbUsd,
  flashes,
  animatedCaps,
}: ArenaWatchlistPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const watchlistTokens = useWatchlistTokens(tokens);

  useEffect(() => {
    setCollapsed(readWatchlistPanelCollapsed());
  }, []);

  const setPanelCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    writeWatchlistPanelCollapsed(next);
  }, []);

  return (
    <aside
      className={`arena-watchlist-panel hidden shrink-0 xl:flex xl:flex-col ${
        collapsed ? "arena-watchlist-panel--collapsed" : ""
      }`}
      aria-label="Watchlist"
    >
      <div className="arena-watchlist-panel-inner panel-surface flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-pump-border/25 bg-pump-card-soft/30 px-3 py-3">
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <PumpIcon icon={faStarRegular} active className="h-3.5 w-3.5 shrink-0 text-pump-accent" />
              <span className="section-label truncate">Watchlist</span>
              <span className="financial-value text-caption text-pump-muted">
                ({watchlistTokens.length})
              </span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setPanelCollapsed(!collapsed)}
            className="toolbar-btn ml-auto shrink-0 !w-8 !px-0"
            aria-label={collapsed ? "Expand watchlist" : "Collapse watchlist"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PumpIcon icon={faChevronLeft} className="h-4 w-4" />
            ) : (
              <PumpIcon icon={faChevronRight} className="h-4 w-4" />
            )}
          </button>
        </div>

        {!collapsed ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-subtle">
            <WatchlistContent
              tokens={tokens}
              bnbUsd={bnbUsd}
              flashes={flashes}
              animatedCaps={animatedCaps}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center gap-2 py-3">
            <PumpIcon icon={faStarRegular} active className="h-4 w-4 text-pump-accent" />
            {watchlistTokens.length > 0 ? (
              <span className="financial-value text-caption font-semibold text-pump-muted">
                {watchlistTokens.length}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

"use client";

import type { ReactNode, RefObject } from "react";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import { PumpIcon, faStarSolid } from "@/lib/icons";
import type { BoardFilter } from "@/lib/arena-filters";

export const ARENA_FILTER_TABS: { key: BoardFilter; label: string }[] = [
  { key: "new", label: "Newest" },
  { key: "all", label: "All" },
  { key: "movers", label: "Movers" },
  { key: "hasAirdrop", label: "Airdrop" },
  { key: "kothContenders", label: "KOTH" },
];

type ArenaFilterNavProps = {
  activeFilter: BoardFilter;
  filterCounts: Record<string, number>;
  search: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onSelect: (filter: BoardFilter) => void;
  onWatchlistOpen?: () => void;
  watchlistOpen?: boolean;
  watchlistCount?: number;
  searchTrailing?: ReactNode;
  trailing?: ReactNode;
};

export function ArenaFilterNav({
  activeFilter,
  filterCounts,
  search,
  searchInputRef,
  onSearchChange,
  onSelect,
  onWatchlistOpen,
  watchlistOpen = false,
  watchlistCount = 0,
  searchTrailing,
  trailing,
}: ArenaFilterNavProps) {
  const watchlistAriaLabel = `Open watchlist${watchlistCount > 0 ? `, ${watchlistCount} tokens` : ""}`;

  return (
    <div className="arena-filter-bar">
      <div className="arena-filter-bar__main">
        <div className="arena-filter-bar__search-row">
          <div className="arena-filter-bar__search">
            <FieldSearchInput
              ref={searchInputRef}
              fieldOnly
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search"
              aria-label="Search coins"
            />
          </div>
          {searchTrailing ? (
            <div className="arena-filter-bar__search-tools">{searchTrailing}</div>
          ) : null}
        </div>

        <nav className="arena-tab-nav" aria-label="Explore filters">
          <div className="arena-tab-nav__track" role="tablist">
            {onWatchlistOpen ? (
              <button
                type="button"
                className={
                  watchlistOpen
                    ? "arena-tab-nav__item arena-tab-nav__item--icon arena-tab-nav__item--active"
                    : "arena-tab-nav__item arena-tab-nav__item--icon"
                }
                onClick={onWatchlistOpen}
                aria-label={watchlistAriaLabel}
                aria-expanded={watchlistOpen}
                aria-haspopup="dialog"
              >
                <PumpIcon
                  icon={faStarSolid}
                  className={`h-3.5 w-3.5 ${watchlistOpen ? "text-pump-accent" : "text-pump-muted"}`}
                />
              </button>
            ) : null}
            {ARENA_FILTER_TABS.map(({ key, label }) => {
              const count = filterCounts[key] ?? 0;
              const isActive = activeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelect(key)}
                  className={
                    isActive
                      ? "arena-tab-nav__item arena-tab-nav__item--active"
                      : "arena-tab-nav__item"
                  }
                >
                  <span>{label}</span>
                  <span className="arena-tab-nav__count financial-value">{count}</span>
                </button>
              );
            })}
            {trailing ? (
              <>
                <span className="arena-tab-nav__tools-divider" aria-hidden />
                <div className="arena-tab-nav__trailing">{trailing}</div>
              </>
            ) : null}
          </div>
        </nav>
      </div>
    </div>
  );
}

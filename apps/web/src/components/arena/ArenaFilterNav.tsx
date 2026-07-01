"use client";

import type { RefObject } from "react";
import { PumpIcon, faRotateCw } from "@/lib/icons";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import type { BoardFilter } from "@/lib/arena-filters";

export const ARENA_FILTER_TABS: { key: BoardFilter; label: string }[] = [
  { key: "new", label: "Newest" },
  { key: "all", label: "All" },
  { key: "movers", label: "Movers" },
  { key: "hasAirdrop", label: "Airdrop" },
  { key: "kothContenders", label: "KOTH" },
  { key: "favorites", label: "Favorites" },
];

type ArenaFilterNavProps = {
  activeFilter: BoardFilter;
  filterCounts: Record<string, number>;
  loading: boolean;
  search: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onSelect: (filter: BoardFilter) => void;
  onRefresh: () => void;
};

export function ArenaFilterNav({
  activeFilter,
  filterCounts,
  loading,
  search,
  searchInputRef,
  onSearchChange,
  onSelect,
  onRefresh,
}: ArenaFilterNavProps) {
  return (
    <div className="arena-filter-bar">
      <div className="arena-filter-bar__main">
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

        <nav className="arena-tab-nav" aria-label="Explore filters">
          <div className="arena-tab-nav__track" role="tablist">
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
          </div>
        </nav>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="chip-button arena-filter-bar__refresh shrink-0 disabled:opacity-50"
        aria-label={loading ? "Refreshing coins" : "Refresh coins"}
      >
        <PumpIcon
          icon={faRotateCw}
          className={`h-3.5 w-3.5 shrink-0${loading ? " animate-spin" : ""}`}
        />
        <span className="hidden sm:inline">{loading ? "Refreshing" : "Refresh"}</span>
      </button>
    </div>
  );
}

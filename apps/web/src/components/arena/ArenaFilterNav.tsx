"use client";

import type { ReactNode, RefObject } from "react";
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
  search: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onSelect: (filter: BoardFilter) => void;
  trailing?: ReactNode;
};

export function ArenaFilterNav({
  activeFilter,
  filterCounts,
  search,
  searchInputRef,
  onSearchChange,
  onSelect,
  trailing,
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

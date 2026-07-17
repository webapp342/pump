"use client";

import type { ReactNode, RefObject } from "react";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import { PumpIcon, faSettings2, faStarRegular } from "@/lib/icons";
import type { BoardFilter } from "@/lib/arena-filters";

export const ARENA_FILTER_TABS: { key: BoardFilter; label: string; mobileLabel?: string }[] = [
  { key: "new", label: "Newest", mobileLabel: "New" },
  { key: "all", label: "All" },
  { key: "movers", label: "Movers" },
  { key: "hasAirdrop", label: "Airdrop" },
];

type ArenaFilterNavProps = {
  activeFilter: BoardFilter;
  filterCounts: Record<string, number>;
  search: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onSelect: (filter: BoardFilter) => void;
  onQuickTradeSettingsOpen?: () => void;
  quickTradeSettingsOpen?: boolean;
  trailing?: ReactNode;
};

function ArenaFilterTabs({
  activeFilter,
  filterCounts,
  onSelect,
  mobile = false,
}: Pick<ArenaFilterNavProps, "activeFilter" | "filterCounts" | "onSelect"> & {
  mobile?: boolean;
}) {
  const favoritesActive = activeFilter === "favorites";

  return (
    <nav className="arena-tab-nav" aria-label="Explore filters">
      <div className="arena-tab-nav__track" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={favoritesActive}
          aria-label="Watchlist"
          onClick={() => onSelect("favorites")}
          className={
            favoritesActive
              ? "arena-tab-nav__item arena-tab-nav__item--icon arena-tab-nav__item--active"
              : "arena-tab-nav__item arena-tab-nav__item--icon"
          }
        >
          <PumpIcon
            icon={faStarRegular}
            active={favoritesActive}
            className={`h-3.5 w-3.5 ${favoritesActive ? "text-pump-accent" : "text-pump-muted"}`}
          />
        </button>
        {ARENA_FILTER_TABS.map(({ key, label, mobileLabel }) => {
          const count = filterCounts[key] ?? 0;
          const isActive = activeFilter === key;
          const tabLabel = mobile && mobileLabel ? mobileLabel : label;
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
              <span>{tabLabel}</span>
              {!mobile ? <span className="arena-tab-nav__count financial-value">{count}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function ArenaFilterNav({
  activeFilter,
  filterCounts,
  search,
  searchInputRef,
  onSearchChange,
  onSelect,
  onQuickTradeSettingsOpen,
  quickTradeSettingsOpen = false,
  trailing,
}: ArenaFilterNavProps) {
  return (
    <div className="arena-filter-bar">
      <div className="arena-filter-bar__mobile-head md:hidden">
        <div className="arena-filter-bar__mobile-tools">
          {onQuickTradeSettingsOpen ? (
            <button
              type="button"
              className={`arena-filter-bar__tool-btn${
                quickTradeSettingsOpen ? " arena-filter-bar__tool-btn--open" : ""
              }`}
              onClick={onQuickTradeSettingsOpen}
              aria-label="Quick trade settings"
              aria-expanded={quickTradeSettingsOpen}
              aria-haspopup="dialog"
            >
              <PumpIcon icon={faSettings2} className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="arena-filter-bar__tabs-row arena-filter-bar__tabs-row--mobile">
          <ArenaFilterTabs
            activeFilter={activeFilter}
            filterCounts={filterCounts}
            onSelect={onSelect}
            mobile
          />
        </div>
      </div>

      <div className="arena-filter-bar__mobile-search md:hidden">
        <FieldSearchInput
          ref={searchInputRef}
          fieldOnly
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search"
          aria-label="Search coins"
        />
      </div>

      <div className="arena-filter-bar__main hidden md:flex">
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
          {onQuickTradeSettingsOpen ? (
            <button
              type="button"
              className={`arena-filter-bar__tool-btn${
                quickTradeSettingsOpen ? " arena-filter-bar__tool-btn--open" : ""
              }`}
              onClick={onQuickTradeSettingsOpen}
              aria-label="Quick trade settings"
              aria-expanded={quickTradeSettingsOpen}
              aria-haspopup="dialog"
            >
              <PumpIcon icon={faSettings2} className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="arena-filter-bar__tabs-row">
          <ArenaFilterTabs
            activeFilter={activeFilter}
            filterCounts={filterCounts}
            onSelect={onSelect}
          />
          {trailing ? <div className="arena-tab-nav__trailing">{trailing}</div> : null}
        </div>
      </div>
    </div>
  );
}

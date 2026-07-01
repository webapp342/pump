"use client";

import { PumpIcon, faRotateCw } from "@/lib/icons";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import type { AirdropFilter } from "@/lib/airdrops-list-ui";

const AIRDROP_FILTERS: { key: AirdropFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "qualifying", label: "Qualifying" },
  { key: "claimable", label: "Claimable" },
  { key: "upcoming", label: "Upcoming" },
  { key: "ended", label: "Ended" },
  { key: "saved", label: "Saved" },
  { key: "mine", label: "Joined" },
];

type AirdropsFilterNavProps = {
  activeFilter: AirdropFilter;
  filterCounts: Record<AirdropFilter, number>;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (filter: AirdropFilter) => void;
  onRefresh: () => void;
};

export function AirdropsFilterNav({
  activeFilter,
  filterCounts,
  loading,
  search,
  onSearchChange,
  onSelect,
  onRefresh,
}: AirdropsFilterNavProps) {
  return (
    <div className="airdrops-filter-bar">
      <div className="airdrops-filter-bar__main">
        <div className="airdrops-filter-bar__search">
          <FieldSearchInput
            fieldOnly
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search"
            aria-label="Search campaigns"
          />
        </div>

        <nav className="airdrops-tab-nav" aria-label="Airdrop filters">
          <div className="airdrops-tab-nav__track" role="tablist">
            {AIRDROP_FILTERS.map(({ key, label }) => {
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
                      ? "airdrops-tab-nav__item airdrops-tab-nav__item--active"
                      : "airdrops-tab-nav__item"
                  }
                >
                  <span>{label}</span>
                  <span className="airdrops-tab-nav__count financial-value">{count}</span>
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
        className="chip-button airdrops-filter-bar__refresh shrink-0 disabled:opacity-50"
        aria-label={loading ? "Refreshing airdrops" : "Refresh airdrops"}
      >
        <PumpIcon icon={faRotateCw} className={`h-3.5 w-3.5 shrink-0${loading ? " animate-spin" : ""}`} />
        <span className="hidden sm:inline">{loading ? "Refreshing" : "Refresh"}</span>
      </button>
    </div>
  );
}

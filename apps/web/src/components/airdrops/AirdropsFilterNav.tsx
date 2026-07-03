"use client";

import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import { PumpIcon, faBookmarkRegular } from "@/lib/icons";
import type { AirdropFilter } from "@/lib/airdrops-list-ui";

const MAIN_AIRDROP_FILTERS: { key: AirdropFilter; label: string }[] = [
  { key: "qualifying", label: "Qualifying" },
  { key: "claimable", label: "Claimable" },
  { key: "upcoming", label: "Upcoming" },
  { key: "ended", label: "Ended" },
];

type AirdropsFilterNavProps = {
  activeFilter: AirdropFilter;
  filterCounts: Record<AirdropFilter, number>;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (filter: AirdropFilter) => void;
};

function AirdropFilterChip({
  filterKey,
  label,
  count,
  isActive,
  iconOnly = false,
  showCount = true,
  onSelect,
}: {
  filterKey: AirdropFilter;
  label: string;
  count: number;
  isActive: boolean;
  iconOnly?: boolean;
  showCount?: boolean;
  onSelect: (filter: AirdropFilter) => void;
}) {
  const ariaLabel = iconOnly
    ? count > 0
      ? `Saved, ${count} campaigns`
      : "Saved campaigns"
    : count > 0
      ? `${label}, ${count} campaigns`
      : label;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={ariaLabel}
      onClick={() => onSelect(filterKey)}
      className={
        isActive
          ? `airdrops-tab-nav__item airdrops-tab-nav__item--active${
              iconOnly ? " airdrops-tab-nav__item--icon" : ""
            }`
          : `airdrops-tab-nav__item${iconOnly ? " airdrops-tab-nav__item--icon" : ""}`
      }
    >
      {iconOnly ? (
        <PumpIcon
          icon={faBookmarkRegular}
          className={`h-3.5 w-3.5 ${isActive ? "text-pump-accent" : ""}`}
        />
      ) : (
        <span>{label}</span>
      )}
      {showCount && !iconOnly ? (
        <span className="airdrops-tab-nav__count financial-value">{count}</span>
      ) : null}
    </button>
  );
}

export function AirdropsFilterNav({
  activeFilter,
  filterCounts,
  search,
  onSearchChange,
  onSelect,
}: AirdropsFilterNavProps) {
  return (
    <div className="airdrops-filter-bar">
      <div className="airdrops-filter-bar__search-row">
        <div className="airdrops-filter-bar__search">
          <FieldSearchInput
            fieldOnly
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search campaigns"
            aria-label="Search campaigns"
          />
        </div>
      </div>

      <div className="airdrops-filter-bar__tabs-row">
        <nav className="airdrops-tab-nav" aria-label="Airdrop filters">
          <div className="airdrops-tab-nav__track" role="tablist">
            <AirdropFilterChip
              filterKey="saved"
              label="Saved"
              count={filterCounts.saved ?? 0}
              isActive={activeFilter === "saved"}
              iconOnly
              showCount={false}
              onSelect={onSelect}
            />
            <div className="airdrops-tab-nav__joined--mobile">
              <AirdropFilterChip
                filterKey="mine"
                label="Joined"
                count={filterCounts.mine ?? 0}
                isActive={activeFilter === "mine"}
                onSelect={onSelect}
              />
            </div>
            {MAIN_AIRDROP_FILTERS.map(({ key, label }) => (
              <AirdropFilterChip
                key={key}
                filterKey={key}
                label={label}
                count={filterCounts[key] ?? 0}
                isActive={activeFilter === key}
                onSelect={onSelect}
              />
            ))}
            <div className="airdrops-tab-nav__joined--desktop">
              <AirdropFilterChip
                filterKey="mine"
                label="Joined"
                count={filterCounts.mine ?? 0}
                isActive={activeFilter === "mine"}
                onSelect={onSelect}
              />
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

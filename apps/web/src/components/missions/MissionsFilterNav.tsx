"use client";

import { PumpIcon, faRotateCw } from "@/lib/icons";
import type { MissionFilter } from "@/lib/missions-types";

const MISSION_FILTERS: { key: MissionFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
];

type MissionsFilterNavProps = {
  activeFilter: MissionFilter;
  filterCounts: Record<MissionFilter, number>;
  loading: boolean;
  disabled?: boolean;
  onSelect: (filter: MissionFilter) => void;
  onRefresh: () => void;
};

export function MissionsFilterNav({
  activeFilter,
  filterCounts,
  loading,
  disabled = false,
  onSelect,
  onRefresh,
}: MissionsFilterNavProps) {
  return (
    <div className="missions-filter-bar">
      <nav className="missions-tab-nav" aria-label="Mission filters">
        <div className="missions-tab-nav__track" role="tablist">
          {MISSION_FILTERS.map(({ key, label }) => {
            const count = filterCounts[key] ?? 0;
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={disabled}
                onClick={() => onSelect(key)}
                className={
                  isActive
                    ? "missions-tab-nav__item missions-tab-nav__item--active"
                    : "missions-tab-nav__item"
                }
              >
                <span>{label}</span>
                <span className="missions-tab-nav__count financial-value">{count}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading || disabled}
        className="chip-button missions-filter-bar__refresh shrink-0 disabled:opacity-50"
        aria-label={loading ? "Refreshing missions" : "Refresh missions"}
      >
        <PumpIcon icon={faRotateCw} className={`h-3.5 w-3.5${loading ? " animate-spin" : ""}`} />
        <span className="hidden sm:inline">{loading ? "Refreshing" : "Refresh"}</span>
      </button>
    </div>
  );
}

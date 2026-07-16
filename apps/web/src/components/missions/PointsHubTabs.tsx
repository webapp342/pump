"use client";

import { POINTS_HUB_TABS, type PointsHubTab } from "@/lib/points-hub-tabs";
import { PumpIcon, faRotateCw } from "@/lib/icons";

type PointsHubTabsProps = {
  activeTab: PointsHubTab;
  onSelect: (tab: PointsHubTab) => void;
  loading?: boolean;
  onRefresh?: () => void;
  showRefresh?: boolean;
};

export function PointsHubTabs({
  activeTab,
  onSelect,
  loading = false,
  onRefresh,
  showRefresh = true,
}: PointsHubTabsProps) {
  return (
    <div className="points-hub-tabs">
      <nav className="points-hub-tabs__nav" aria-label="Pump Points sections">
        <div className="points-hub-tabs__track" role="tablist">
          {POINTS_HUB_TABS.map(({ id, label }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(id)}
                className={
                  isActive
                    ? "points-hub-tabs__item points-hub-tabs__item--active"
                    : "points-hub-tabs__item"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>
      {showRefresh && onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="chip-button points-hub-tabs__refresh shrink-0 disabled:opacity-50"
          aria-label={loading ? "Refreshing" : "Refresh"}
        >
          <PumpIcon
            icon={faRotateCw}
            size="xs"
            className={loading ? "animate-spin" : undefined}
          />
          <span className="hidden sm:inline">{loading ? "Refreshing" : "Refresh"}</span>
        </button>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { PumpIcon, faRotateCw } from "@/lib/icons";
import { PointsInventoryList } from "@/components/missions/PointsInventoryList";
import { PointsMarketGrid } from "@/components/missions/PointsMarketGrid";
import type { PointsLevelStatus } from "@/lib/points-levels";
import type { PointsMarketView } from "@/lib/points-hub-tabs";
import type { PointsMarketItem } from "@/lib/points-market-catalog";
import type { PointsInventoryItem } from "@/lib/points-inventory-types";
import { REWARDS_CHALLENGES, REWARDS_MARKET } from "@/lib/rewards-copy";

const MARKET_VIEWS: { id: PointsMarketView; label: string }[] = [
  { id: "shop", label: REWARDS_MARKET.shop },
  { id: "inventory", label: REWARDS_MARKET.inventory },
];

type PointsMarketPanelProps = {
  view: PointsMarketView;
  onSelectView: (view: PointsMarketView) => void;
  level: PointsLevelStatus;
  spendablePoints: number;
  address?: string;
  guestMode?: boolean;
  redeemingId?: string | null;
  inventoryRefreshKey?: number;
  loading?: boolean;
  onRefresh?: () => void;
  onRedeem?: (item: PointsMarketItem) => void;
};

export function PointsMarketPanel({
  view,
  onSelectView,
  level,
  spendablePoints,
  address = "",
  guestMode = false,
  redeemingId = null,
  inventoryRefreshKey = 0,
  loading = false,
  onRefresh,
  onRedeem,
}: PointsMarketPanelProps) {
  const [inventory, setInventory] = useState<PointsInventoryItem[]>([]);

  useEffect(() => {
    if (guestMode || !address) {
      setInventory([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/missions/inventory?address=${address}`);
        const body = (await response.json()) as {
          data?: { inventory: PointsInventoryItem[] };
        };
        if (!response.ok || cancelled) return;
        setInventory(body.data?.inventory ?? []);
      } catch {
        if (!cancelled) setInventory([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, guestMode, inventoryRefreshKey]);

  const ownedItemIds = useMemo(
    () => new Set(inventory.map((row) => row.itemId)),
    [inventory]
  );

  return (
    <div className="points-market-panel">
      <div className="missions-filter-bar points-market-panel__filters">
        <nav className="missions-tab-nav" aria-label={REWARDS_MARKET.sectionsAria}>
          <div className="missions-tab-nav__track" role="tablist">
            {MARKET_VIEWS.map(({ id, label }) => {
              const isActive = view === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelectView(id)}
                  className={
                    isActive
                      ? "missions-tab-nav__item missions-tab-nav__item--active"
                      : "missions-tab-nav__item"
                  }
                >
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="chip-button missions-filter-bar__refresh shrink-0 disabled:opacity-50"
            aria-label={
              loading ? REWARDS_CHALLENGES.refreshingLabel : REWARDS_CHALLENGES.refreshLabel
            }
          >
            <PumpIcon
              icon={faRotateCw}
              className={`h-3.5 w-3.5 shrink-0${loading ? " animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {loading ? REWARDS_CHALLENGES.refreshingLabel : REWARDS_CHALLENGES.refreshLabel}
            </span>
          </button>
        ) : null}
      </div>

      <div className="points-hub-panel points-market-panel__body">
        {view === "inventory" ? (
          <PointsInventoryList
            address={address}
            guestMode={guestMode}
            refreshKey={inventoryRefreshKey}
          />
        ) : (
          <PointsMarketGrid
            level={level}
            spendablePoints={spendablePoints}
            guestMode={guestMode}
            redeemingId={redeemingId}
            ownedItemIds={ownedItemIds}
            onRedeem={onRedeem}
          />
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { PumpIcon, faBolt } from "@/lib/icons";
import type { PointsInventoryItem } from "@/lib/points-inventory-types";
import { POINTS_MARKET_CATALOG } from "@/lib/points-market-catalog";
import { REWARDS_MARKET } from "@/lib/rewards-copy";

function itemTitle(itemId: string): string {
  return POINTS_MARKET_CATALOG.find((item) => item.id === itemId)?.title ?? itemId;
}

function itemDescription(itemId: string): string | null {
  return POINTS_MARKET_CATALOG.find((item) => item.id === itemId)?.description ?? null;
}

type PointsInventoryListProps = {
  address: string;
  guestMode?: boolean;
  /** Bump to refetch after redeem. */
  refreshKey?: number;
};

export function PointsInventoryList({
  address,
  guestMode = false,
  refreshKey = 0,
}: PointsInventoryListProps) {
  const [inventory, setInventory] = useState<PointsInventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!guestMode);

  useEffect(() => {
    if (guestMode || !address) {
      setInventory([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/missions/inventory?address=${address}`);
        const body = (await response.json()) as {
          data?: { inventory: PointsInventoryItem[] };
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Failed to load owned perks");
        if (cancelled) return;
        setInventory(body.data?.inventory ?? []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load owned perks");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, guestMode, refreshKey]);

  if (guestMode) {
    return (
      <p className="type-legal text-pump-muted points-inventory__empty">{REWARDS_MARKET.ownedGuest}</p>
    );
  }

  if (error) {
    return <div className="missions-notice notice-error">{error}</div>;
  }

  if (loading) {
    return (
      <p className="type-legal text-pump-muted points-inventory__empty">{REWARDS_MARKET.ownedLoading}</p>
    );
  }

  if (inventory.length === 0) {
    return (
      <p className="type-legal text-pump-muted points-inventory__empty">{REWARDS_MARKET.ownedEmpty}</p>
    );
  }

  return (
    <ul className="points-inventory__list" aria-label={REWARDS_MARKET.ownedAria}>
      {inventory.map((item) => {
        const description = itemDescription(item.itemId);
        return (
          <li key={item.id} className="points-inventory__row">
            <PumpIcon icon={faBolt} size="sm" className="points-inventory__icon" />
            <div className="points-inventory__copy">
              <span className="points-inventory__title">{itemTitle(item.itemId)}</span>
              {description ? (
                <span className="type-legal text-pump-muted">{description}</span>
              ) : (
                <span className="type-legal text-pump-muted">{item.status}</span>
              )}
            </div>
            <time className="type-legal text-pump-muted financial-value">
              {new Date(item.createdAt).toLocaleDateString()}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

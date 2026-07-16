"use client";

import { useEffect, useState } from "react";
import { PumpIcon, faBolt, faDeposit, faWithdraw } from "@/lib/icons";
import type { PointsLedgerEntry, PointsInventoryItem } from "@/lib/points-activity-types";
import { POINTS_MARKET_CATALOG } from "@/lib/points-market-catalog";

function itemTitle(itemId: string): string {
  return POINTS_MARKET_CATALOG.find((item) => item.id === itemId)?.title ?? itemId;
}

function formatLedgerLabel(taskType: string): string {
  if (taskType.startsWith("REDEEM:")) {
    return `Redeem · ${itemTitle(taskType.slice("REDEEM:".length))}`;
  }
  return taskType.replace(/^LAUNCHPAD_/, "").replaceAll("_", " ");
}

type PointsActivityPanelProps = {
  address: string;
  guestMode?: boolean;
};

export function PointsActivityPanel({ address, guestMode = false }: PointsActivityPanelProps) {
  const [ledger, setLedger] = useState<PointsLedgerEntry[]>([]);
  const [inventory, setInventory] = useState<PointsInventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!guestMode);

  useEffect(() => {
    if (guestMode || !address) {
      setLedger([]);
      setInventory([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/missions/activity?address=${address}`);
        const body = (await response.json()) as {
          data?: { ledger: PointsLedgerEntry[]; inventory: PointsInventoryItem[] };
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Failed to load activity");
        if (cancelled) return;
        setLedger(body.data?.ledger ?? []);
        setInventory(body.data?.inventory ?? []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load activity");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, guestMode]);

  if (guestMode) {
    return (
      <div className="points-hub-panel">
        <header className="points-market__head">
          <h2 className="section-heading">Activity</h2>
          <p className="type-legal text-pump-muted">Sign in to see points earned, spent, and inventory.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="points-hub-panel points-activity">
      <header className="points-market__head">
        <h2 className="section-heading">Activity</h2>
        <p className="type-legal text-pump-muted">Ledger of earns, redeems, and active inventory.</p>
      </header>

      {error ? <div className="missions-notice notice-error">{error}</div> : null}

      <section className="points-activity__inventory" aria-label="Inventory">
        <h3 className="section-label">Inventory</h3>
        {loading ? (
          <p className="type-legal text-pump-muted">Loading…</p>
        ) : inventory.length === 0 ? (
          <p className="type-legal text-pump-muted">No rewards redeemed yet.</p>
        ) : (
          <ul className="points-activity__list">
            {inventory.map((item) => (
              <li key={item.id} className="points-activity__row">
                <PumpIcon icon={faBolt} size="sm" className="points-activity__icon" />
                <div className="points-activity__copy">
                  <span className="points-activity__title">{itemTitle(item.itemId)}</span>
                  <span className="type-legal text-pump-muted">{item.status}</span>
                </div>
                <time className="type-legal text-pump-muted financial-value">
                  {new Date(item.createdAt).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="points-activity__ledger" aria-label="Ledger">
        <h3 className="section-label">Ledger</h3>
        {loading ? (
          <p className="type-legal text-pump-muted">Loading…</p>
        ) : ledger.length === 0 ? (
          <p className="type-legal text-pump-muted">No activity yet.</p>
        ) : (
          <ul className="points-activity__list">
            {ledger.map((entry) => {
              const earn = entry.pointsDelta >= 0;
              return (
                <li key={entry.id} className="points-activity__row">
                  <PumpIcon
                    icon={earn ? faDeposit : faWithdraw}
                    size="sm"
                    className={`points-activity__icon${earn ? " text-pump-success" : " text-pump-danger"}`}
                  />
                  <div className="points-activity__copy">
                    <span className="points-activity__title">{formatLedgerLabel(entry.taskType)}</span>
                    <time className="type-legal text-pump-muted">
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <span
                    className={`financial-value points-activity__delta${
                      earn ? " text-pump-accent" : " text-pump-danger"
                    }`}
                  >
                    {earn ? "+" : ""}
                    {entry.pointsDelta.toLocaleString()} pts
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

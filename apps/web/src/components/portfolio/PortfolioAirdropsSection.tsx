"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MyAirdropParticipation } from "@/lib/db/airdrops";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import {
  JoinedAirdropsList,
  fetchJoinedAirdrops,
} from "@/components/portfolio/joined-airdrops-shared";
import {
  isPortfolioTrackedAirdrop,
  sortJoinedAirdropsForPortfolio,
} from "@/lib/portfolio-airdrop-summary";

/** Fetch all joined rows from DB in one query — refresh is separate. */
const JOINED_FETCH_LIMIT = 500;

export function PortfolioAirdropsSection({ address }: { address: string }) {
  const [items, setItems] = useState<MyAirdropParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const { bnbUsd } = useBnbUsdPrice();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setItems([]);
      try {
        const snapshot = await fetchJoinedAirdrops(address, JOINED_FETCH_LIMIT);
        if (cancelled) return;
        setItems(snapshot);
        setLoading(false);

        const tracked = snapshot.filter(isPortfolioTrackedAirdrop);
        if (tracked.length === 0) return;

        const refreshed = await fetchJoinedAirdrops(address, JOINED_FETCH_LIMIT, {
          refresh: true,
        });
        if (!cancelled) setItems(refreshed);
      } catch {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const visibleItems = useMemo(
    () => sortJoinedAirdropsForPortfolio(items.filter(isPortfolioTrackedAirdrop)),
    [items]
  );

  if (loading) {
    return (
      <div className="portfolio-airdrops-panel portfolio-tab-panel">
        <div className="panel-surface empty-state flex flex-col items-center justify-center py-10">
          <p className="empty-state-copy">Loading…</p>
        </div>
      </div>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <div className="portfolio-airdrops-panel portfolio-tab-panel">
        <div className="panel-surface empty-state flex flex-col items-center justify-center py-10">
          <p className="empty-state-copy">No joined airdrops yet.</p>
          <Link href="/airdrops" className="chip-button chip-button-active mt-4 px-4 py-1.5 text-caption">
            Browse airdrops
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio-airdrops-panel portfolio-tab-panel">
      <section className="panel-surface portfolio-section-surface portfolio-tab-panel__surface">
        <JoinedAirdropsList items={visibleItems} bnbUsd={bnbUsd} />
      </section>
    </div>
  );
}

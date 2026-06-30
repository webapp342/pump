"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MyAirdropParticipation } from "@/lib/db/airdrops";
import { MetricIcons } from "@/lib/metric-icons";
import { PumpIcon } from "@/lib/icons";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { ClaimAllAirdropsModal } from "@/components/portfolio/ClaimAllAirdropsModal";
import {
  JoinedAirdropsList,
  fetchJoinedAirdrops,
} from "@/components/portfolio/joined-airdrops-shared";
import {
  isPortfolioTrackedAirdrop,
  partitionJoinedAirdrops,
  sortJoinedAirdropsForPortfolio,
} from "@/lib/portfolio-airdrop-summary";

/** Fetch all joined rows from DB in one query — refresh is separate. */
const JOINED_FETCH_LIMIT = 500;

export function PortfolioAirdropsSection({
  address,
  embedded = false,
}: {
  address: string;
  embedded?: boolean;
}) {
  const [items, setItems] = useState<MyAirdropParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { bnbUsd } = useBnbUsdPrice();

  const reloadItems = useCallback(
    async (options?: { refresh?: boolean }) => {
      try {
        const data = await fetchJoinedAirdrops(address, JOINED_FETCH_LIMIT, {
          refresh: options?.refresh,
        });
        setItems(data);
        return data;
      } catch {
        setItems([]);
        return [];
      }
    },
    [address]
  );

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

  useEffect(() => {
    if (!modalOpen) return;

    let cancelled = false;
    void fetchJoinedAirdrops(address, JOINED_FETCH_LIMIT, { refresh: true })
      .then((data) => {
        if (!cancelled) setItems(data);
      });

    return () => {
      cancelled = true;
    };
  }, [address, modalOpen]);

  const visibleItems = useMemo(
    () => sortJoinedAirdropsForPortfolio(items.filter(isPortfolioTrackedAirdrop)),
    [items]
  );

  const claimableCount = useMemo(
    () => partitionJoinedAirdrops(visibleItems).claimable.length,
    [visibleItems]
  );

  if (loading) {
    if (!embedded) return null;
    return (
      <section className="panel-surface portfolio-rewards-section p-4" aria-busy="true">
        <p className="text-body-sm text-pump-muted">Loading airdrops…</p>
      </section>
    );
  }

  if (visibleItems.length === 0) {
    if (!embedded) return null;
    return (
      <section className="panel-surface portfolio-rewards-section empty-state">
        <p className="empty-state-copy">No joined airdrops yet.</p>
        <Link href="/airdrops" className="primary-button mt-3 px-5 py-2 text-body-sm">
          Browse airdrops
        </Link>
      </section>
    );
  }

  return (
    <>
      <div className={embedded ? "portfolio-rewards-section space-y-3" : "space-y-2 md:space-y-3"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3
            className={
              embedded
                ? "card-title text-body font-semibold text-pump-text"
                : "section-heading text-h3 inline-flex items-center gap-2"
            }
          >
            {!embedded ? (
              <PumpIcon
                icon={MetricIcons.airdrops}
                className="hidden h-[1.05em] w-[1.05em] shrink-0 text-pump-accent sm:block"
              />
            ) : null}
            Joined airdrops ({visibleItems.length})
          </h3>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={
              claimableCount > 0
                ? "primary-button shrink-0 px-3 py-1.5 text-caption"
                : "secondary-button shrink-0 px-3 py-1.5 text-caption"
            }
          >
            Claim all{claimableCount > 0 ? ` (${claimableCount})` : ""}
          </button>
        </div>

        <JoinedAirdropsList items={visibleItems} bnbUsd={bnbUsd} />
      </div>

      <ClaimAllAirdropsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        items={visibleItems}
        address={address}
        onClaimed={() => {
          void reloadItems({ refresh: true });
        }}
      />
    </>
  );
}

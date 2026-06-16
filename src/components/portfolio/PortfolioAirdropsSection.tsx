"use client";

import { useEffect, useMemo, useState } from "react";
import type { MyAirdropParticipation } from "@/lib/db/airdrops";
import { MetricIcons } from "@/lib/metric-icons";
import { ICON_STROKE } from "@/lib/icons";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { ClaimAllAirdropsModal } from "@/components/portfolio/ClaimAllAirdropsModal";
import {
  JoinedAirdropsList,
  fetchJoinedAirdrops,
} from "@/components/portfolio/joined-airdrops-shared";
import { partitionJoinedAirdrops } from "@/lib/portfolio-airdrop-summary";

const PREVIEW_LIMIT = 5;

export function PortfolioAirdropsSection({ address }: { address: string }) {
  const [items, setItems] = useState<MyAirdropParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { bnbUsd } = useBnbUsdPrice();

  function loadItems() {
    setLoading(true);
    return fetchJoinedAirdrops(address, 50)
      .then((data) => {
        setItems(data);
      })
      .catch(() => {
        setItems([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchJoinedAirdrops(address, 50);
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const visibleItems = useMemo(
    () => items.filter((item) => item.displayStatus !== "CLOSED"),
    [items]
  );

  const previewItems = useMemo(
    () => visibleItems.slice(0, PREVIEW_LIMIT),
    [visibleItems]
  );

  const claimableCount = useMemo(
    () => partitionJoinedAirdrops(visibleItems).claimable.length,
    [visibleItems]
  );

  if (loading) {
    return (
      <div className="space-y-2 md:space-y-3">
        <h3 className="section-heading text-h3 inline-flex items-center gap-2">
          <MetricIcons.airdrops
            className="hidden h-[1.05em] w-[1.05em] shrink-0 text-pump-accent sm:block"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          Joined airdrops
        </h3>
        <div className="skeleton-shimmer h-16 rounded-lg" />
      </div>
    );
  }

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="section-heading text-h3 inline-flex items-center gap-2">
            <MetricIcons.airdrops
              className="hidden h-[1.05em] w-[1.05em] shrink-0 text-pump-accent sm:block"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            Joined airdrops ({visibleItems.length})
          </h3>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={
              claimableCount > 0
                ? "primary-button px-3 py-1.5 text-caption"
                : "secondary-button px-3 py-1.5 text-caption"
            }
          >
            Claim all{claimableCount > 0 ? ` (${claimableCount})` : ""}
          </button>
        </div>

        <JoinedAirdropsList items={previewItems} bnbUsd={bnbUsd} />
      </div>

      <ClaimAllAirdropsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        items={visibleItems}
        address={address}
        onClaimed={() => {
          void loadItems();
        }}
      />
    </>
  );
}

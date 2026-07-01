"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AirdropListItem } from "@/lib/db/airdrops";
import type { AirdropsHomePayload } from "@/lib/airdrops-server";
import { airdropRewardUsd } from "@/lib/airdrop-board-format";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount } from "wagmi";
import { AirdropsSkeleton } from "@/components/airdrops/AirdropsSkeleton";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { AirdropsHero } from "@/components/airdrops/AirdropsHero";
import { AirdropsFilterNav } from "@/components/airdrops/AirdropsFilterNav";
import { AirdropCampaignList } from "@/components/airdrops/AirdropCampaignList";
import {
  airdropCampaignTitle,
  airdropPoolSymbol,
  airdropStatusSortWeight,
  enrichAirdropItem,
  matchesAirdropFilter,
  type AirdropFilter,
  type AirdropSortDir,
  type AirdropSortKey,
} from "@/lib/airdrops-list-ui";
import { useAirdropSaves } from "@/components/airdrops/AirdropSavesProvider";

export function AirdropsListClient({
  initialPayload = null,
}: {
  initialPayload?: AirdropsHomePayload | null;
}) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();
  const { saves } = useAirdropSaves();
  const [items, setItems] = useState<AirdropListItem[] | null>(initialPayload?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<AirdropFilter>("all");
  const [sortKey, setSortKey] = useState<AirdropSortKey>("reward");
  const [sortDir, setSortDir] = useState<AirdropSortDir>("desc");
  const [refreshing, setRefreshing] = useState(false);
  const [mineIds, setMineIds] = useState<Set<string>>(new Set());
  const { bnbUsd } = useBnbUsdPrice();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/airdrops", { cache: "no-store" });
      const json = (await res.json()) as { data?: AirdropListItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load airdrops");
      setItems(json.data ?? []);
      setError(null);
    } catch (err) {
      setItems(null);
      setError(err instanceof Error ? err.message : "Failed to load airdrops");
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const initialPayloadRef = useRef(initialPayload);

  useEffect(() => {
    if (initialPayloadRef.current) {
      initialPayloadRef.current = null;
      void load();
      const timer = window.setInterval(() => void load(), 30_000);
      return () => window.clearInterval(timer);
    }

    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!address) {
      setMineIds(new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/airdrops/mine?address=${encodeURIComponent(address)}&idsOnly=1&limit=500`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          data?: Array<{ id: string } | string>;
        };
        if (!cancelled && res.ok && Array.isArray(json.data)) {
          setMineIds(
            new Set(json.data.map((entry) => (typeof entry === "string" ? entry : entry.id)))
          );
        }
      } catch {
        if (!cancelled) setMineIds(new Set());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const resolvedItems = useMemo(
    () => (items ?? []).map((item) => enrichAirdropItem(item, bnbUsd)),
    [items, bnbUsd]
  );

  const stats = useMemo(() => {
    let totalUsd = 0;
    let pricedCount = 0;
    for (const item of resolvedItems) {
      const usd = airdropRewardUsd(item, bnbUsd);
      if (usd != null) {
        totalUsd += usd;
        pricedCount += 1;
      }
    }
    return {
      totalUsd: pricedCount > 0 ? totalUsd : null,
    };
  }, [resolvedItems, bnbUsd]);

  const qualifyingCount = useMemo(
    () => resolvedItems.filter((item) => item.displayStatus === "QUALIFYING").length,
    [resolvedItems]
  );

  const claimableCount = useMemo(
    () => resolvedItems.filter((item) => item.displayStatus === "CLAIMABLE").length,
    [resolvedItems]
  );

  const upcomingCount = useMemo(
    () => resolvedItems.filter((item) => item.displayStatus === "UPCOMING").length,
    [resolvedItems]
  );

  const filterCounts = useMemo(
    (): Record<AirdropFilter, number> => ({
      all: resolvedItems.length,
      qualifying: resolvedItems.filter((i) =>
        matchesAirdropFilter(i, "qualifying", saves, mineIds)
      ).length,
      claimable: resolvedItems.filter((i) =>
        matchesAirdropFilter(i, "claimable", saves, mineIds)
      ).length,
      upcoming: resolvedItems.filter((i) =>
        matchesAirdropFilter(i, "upcoming", saves, mineIds)
      ).length,
      ended: resolvedItems.filter((i) => matchesAirdropFilter(i, "ended", saves, mineIds)).length,
      saved: resolvedItems.filter((i) => matchesAirdropFilter(i, "saved", saves, mineIds)).length,
      mine: resolvedItems.filter((i) => matchesAirdropFilter(i, "mine", saves, mineIds)).length,
    }),
    [resolvedItems, saves, mineIds]
  );

  const boardItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = resolvedItems.filter((item) => {
      if (term) {
        const haystack = [
          airdropCampaignTitle(item),
          airdropPoolSymbol(item),
          item.linkedName,
          item.linkedSymbol,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return matchesAirdropFilter(item, activeFilter, saves, mineIds);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (activeFilter === "all") {
        const aClosed = a.displayStatus === "CLOSED";
        const bClosed = b.displayStatus === "CLOSED";
        if (aClosed !== bClosed) return aClosed ? 1 : -1;
      }

      let delta = 0;
      if (sortKey === "reward") delta = a.rewardUsd - b.rewardUsd;
      else if (sortKey === "end") {
        delta = new Date(a.qualifyEnd).getTime() - new Date(b.qualifyEnd).getTime();
      } else if (sortKey === "start") {
        delta = new Date(a.qualifyStart).getTime() - new Date(b.qualifyStart).getTime();
      } else {
        delta = airdropStatusSortWeight(a.displayStatus) - airdropStatusSortWeight(b.displayStatus);
      }
      return sortDir === "asc" ? delta : -delta;
    });

    return sorted;
  }, [resolvedItems, search, activeFilter, sortKey, sortDir, saves, mineIds]);

  const walletFilterActive =
    (activeFilter === "saved" || activeFilter === "mine") && !isConnected;

  function onSort(nextKey: AirdropSortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "reward" ? "desc" : "asc");
  }

  if (items === null && !error) {
    return <AirdropsSkeleton />;
  }

  if (error) {
    return <div className="notice-error p-4">{error}</div>;
  }

  if (resolvedItems.length === 0) {
    return (
      <div className="airdrops-page">
        <div className="airdrops-hub">
          <AirdropsHero
            totalUsd={null}
            campaignCount={0}
            qualifyingCount={0}
            claimableCount={0}
            upcomingCount={0}
          />
          <div className="empty-state airdrops-empty-state">
            <p className="empty-state-copy">No active airdrop campaigns yet.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="airdrops-page">
      <div className="airdrops-hub">
        <AirdropsHero
          totalUsd={stats.totalUsd}
          campaignCount={resolvedItems.length}
          qualifyingCount={qualifyingCount}
          claimableCount={claimableCount}
          upcomingCount={upcomingCount}
        />

        <AirdropsFilterNav
          activeFilter={activeFilter}
          filterCounts={filterCounts}
          loading={refreshing}
          search={search}
          onSearchChange={setSearch}
          onSelect={setActiveFilter}
          onRefresh={() => void handleRefresh()}
        />

        <div className="airdrops-body">
          {walletFilterActive ? (
            <div className="airdrops-sign-in-banner">
              <div className="airdrops-sign-in-banner__copy">
                <p className="airdrops-sign-in-banner__title">
                  Connect wallet to view{" "}
                  {activeFilter === "saved" ? "saved campaigns" : "joined airdrops"}
                </p>
                <p className="airdrops-sign-in-banner__desc">
                  Sign in with your wallet to see campaigns you saved or joined.
                </p>
              </div>
              <button
                type="button"
                className="primary-button airdrops-sign-in-banner__cta"
                onClick={() => openConnectModal?.()}
              >
                Connect
              </button>
            </div>
          ) : boardItems.length === 0 ? (
            <div className="empty-state airdrops-empty-state">
              <p className="empty-state-copy">
                {activeFilter === "saved"
                  ? "No saved campaigns yet. Tap the bookmark on any campaign to save it."
                  : activeFilter === "mine"
                  ? "No joined airdrops yet. Complete on-chain requirements during qualify to track progress here."
                  : activeFilter === "claimable"
                    ? "No campaigns in the claimable phase right now."
                    : activeFilter === "qualifying"
                      ? "No campaigns open for qualify right now."
                      : "No campaigns match your filters."}
              </p>
            </div>
          ) : (
            <AirdropCampaignList
              items={boardItems}
              bnbUsd={bnbUsd}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
          )}
        </div>
      </div>
    </div>
  );
}


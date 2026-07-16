"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import {
  listPendingMissionKeys,
  type OptimisticActivity,
} from "@/lib/optimistic-activity";
import { MissionsGuestPanel } from "@/components/missions/MissionsGuestPanel";
import { MissionsPanelSkeleton } from "@/components/missions/MissionsPanelSkeleton";
import { PointsHubBody } from "@/components/missions/PointsHubBody";
import { PointsHubTabs } from "@/components/missions/PointsHubTabs";
import { PointsStatusCard } from "@/components/missions/PointsStatusCard";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";
import type { Mission, MissionFilter, MissionsData } from "@/lib/missions-types";
import { getPointsLevel } from "@/lib/points-levels";
import {
  parsePointsHubTab,
  parsePointsMarketView,
  pointsHubHref,
  type PointsHubTab,
  type PointsMarketView,
} from "@/lib/points-hub-tabs";
import type { PointsMarketItem } from "@/lib/points-market-catalog";
import { REWARDS_CHALLENGES } from "@/lib/rewards-copy";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";

const BURST_POLL_MS = 1_500;
const BURST_DURATION_MS = 60_000;

export function MissionsPanel() {
  const { address, isConnected } = useAccount();
  const { login } = usePumpWallet();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<MissionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MissionFilter>("open");
  const [pendingKeys, setPendingKeys] = useState<string[]>(() => listPendingMissionKeys());
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);

  const rawTab = searchParams.get("tab");
  const activeTab = parsePointsHubTab(rawTab);
  const marketView: PointsMarketView =
    rawTab === "activity" ? "inventory" : parsePointsMarketView(searchParams.get("market"));

  const setActiveTab = useCallback(
    (tab: PointsHubTab) => {
      router.replace(pointsHubHref(tab), { scroll: false });
    },
    [router]
  );

  const setMarketView = useCallback(
    (view: PointsMarketView) => {
      router.replace(pointsHubHref("market", view), { scroll: false });
    },
    [router]
  );

  const loadMissions = useCallback(async (walletAddress: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/missions?address=${walletAddress}`);
      const body = (await response.json()) as { data?: MissionsData; error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? REWARDS_CHALLENGES.loadError);
      }

      const next = body.data ?? null;
      if (next && next.lifetimePoints == null) {
        next.lifetimePoints = next.totalPoints;
      }
      setData(next);

      const stillPending = listPendingMissionKeys();
      setPendingKeys(stillPending);

      if (body.data && stillPending.length > 0) {
        const completedKeys = new Set(
          body.data.missions.filter((m) => m.completed).map((m) => m.taskKey)
        );
        setPendingKeys(stillPending.filter((key) => !completedKeys.has(key)));
      }
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : REWARDS_CHALLENGES.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    void loadMissions(address);
  }, [address, isConnected, loadMissions]);

  useEffect(() => {
    if (!isConnected || !address) return;

    let burstUntil = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      const delay = Date.now() < burstUntil ? BURST_POLL_MS : 15_000;
      timer = setTimeout(async () => {
        await loadMissions(address);
        schedule();
      }, delay);
    };

    const onActivity = (event: Event) => {
      const detail = (event as CustomEvent<OptimisticActivity>).detail;
      if (detail.missionKeys?.length) {
        setPendingKeys((prev) => [...new Set([...prev, ...detail.missionKeys!])]);
      }
      burstUntil = Date.now() + BURST_DURATION_MS;
      void loadMissions(address);
      schedule();
    };

    window.addEventListener("pump:activity", onActivity);
    schedule();

    return () => {
      window.removeEventListener("pump:activity", onActivity);
      if (timer) clearTimeout(timer);
    };
  }, [address, isConnected, loadMissions]);

  const onAdminLinkClick = useCallback(
    async (mission: Pick<Mission, "taskKey" | "completed" | "targetUrl">) => {
      if (!address || mission.completed || !mission.targetUrl) return;

      setCompletingKey(mission.taskKey);
      setError(null);

      window.open(mission.targetUrl, "_blank", "noopener,noreferrer");

      try {
        const response = await fetch("/api/missions/complete-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, taskKey: mission.taskKey }),
        });
        const body = (await response.json()) as {
          data?: { status: string; pointsAwarded: number; totalPoints: number };
          error?: string;
        };

        if (!response.ok) {
          throw new Error(body.error ?? "Failed to complete task");
        }

        await loadMissions(address);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to complete task");
      } finally {
        setCompletingKey(null);
      }
    },
    [address, loadMissions]
  );

  const onRedeem = useCallback(
    async (item: PointsMarketItem) => {
      if (!address) return;
      setRedeemingId(item.id);
      setError(null);
      try {
        const response = await fetch("/api/missions/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, itemId: item.id }),
        });
        const body = (await response.json()) as {
          data?: { totalPoints: number; lifetimePoints: number };
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Redeem failed");
        }
        await loadMissions(address);
        setInventoryRefreshKey((key) => key + 1);
        setMarketView("inventory");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Redeem failed");
      } finally {
        setRedeemingId(null);
      }
    },
    [address, loadMissions, setMarketView]
  );

  const completedCount = data?.missions.filter((m) => m.completed).length ?? 0;
  const openCount = data?.missions.filter((m) => !m.completed).length ?? 0;

  const level = useMemo(
    () => getPointsLevel(data?.lifetimePoints ?? data?.totalPoints ?? 0),
    [data?.lifetimePoints, data?.totalPoints]
  );

  const filterCounts = useMemo(
    () => ({
      open: openCount,
      done: completedCount,
    }),
    [openCount, completedCount]
  );

  const boardMissions = useMemo(() => {
    if (!data) return [];
    return data.missions.filter((mission) =>
      activeFilter === "done" ? mission.completed : !mission.completed
    );
  }, [data, activeFilter]);

  if (!isConnected || !address) {
    return (
      <MissionsGuestPanel
        onSignIn={() => {
          login();
        }}
      />
    );
  }

  if (loading && !data) {
    return <MissionsPanelSkeleton />;
  }

  return (
    <div className="missions-page">
      <HubDiscoveryScrollLock />
      <div className="missions-hub points-hub">
        <div className="points-hub__layout">
          {data ? (
            <div className="points-hub__status">
              <PointsStatusCard
                level={level}
                spendablePoints={data.totalPoints}
              />
            </div>
          ) : null}

          {error ? (
            <div className="missions-notice notice-error">
              {error}
              {error.includes("VM1_MAIN_DB_URL") ? (
                <p className="mt-2 field-hint">
                  Local dev: SSH tunnel ui-app 7433 → localhost 17433 and set VM1_MAIN_DB_URL in
                  .env
                </p>
              ) : null}
            </div>
          ) : null}

          {data && !error ? (
            <>
              <PointsHubTabs
                activeTab={activeTab}
                onSelect={setActiveTab}
                loading={loading}
                onRefresh={() => {
                  if (activeTab === "leaderboard") {
                    setLeaderboardRefreshKey((key) => key + 1);
                    return;
                  }
                  void loadMissions(address);
                }}
                showRefresh={activeTab === "leaderboard"}
              />

              <div className="points-hub__body" key={`${pathname}-${activeTab}-${marketView}`}>
                <PointsHubBody
                  tab={activeTab}
                  marketView={marketView}
                  onSelectMarketView={setMarketView}
                  level={level}
                  spendablePoints={data.totalPoints}
                  address={address}
                  boardMissions={boardMissions}
                  activeFilter={activeFilter}
                  filterCounts={filterCounts}
                  loading={loading}
                  pendingKeys={pendingKeys}
                  completingKey={completingKey}
                  redeemingId={redeemingId}
                  inventoryRefreshKey={inventoryRefreshKey}
                  leaderboardRefreshKey={leaderboardRefreshKey}
                  onSelectFilter={setActiveFilter}
                  onRefresh={() => {
                    if (activeTab === "market" && marketView === "inventory") {
                      setInventoryRefreshKey((key) => key + 1);
                    }
                    if (activeTab === "leaderboard") {
                      setLeaderboardRefreshKey((key) => key + 1);
                      return;
                    }
                    void loadMissions(address);
                  }}
                  onAdminLinkClick={(mission) => void onAdminLinkClick(mission)}
                  onRedeem={(item) => void onRedeem(item)}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

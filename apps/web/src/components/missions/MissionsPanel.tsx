"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount } from "wagmi";
import {
  listPendingMissionKeys,
  type OptimisticActivity,
} from "@/lib/optimistic-activity";
import { MissionsFilterNav } from "@/components/missions/MissionsFilterNav";
import { MissionsGuestPanel } from "@/components/missions/MissionsGuestPanel";
import { MissionsHero } from "@/components/missions/MissionsHero";
import { MissionsList } from "@/components/missions/MissionList";
import { MissionsPanelSkeleton } from "@/components/missions/MissionsPanelSkeleton";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";
import type { Mission, MissionFilter, MissionsData } from "@/lib/missions-types";

const BURST_POLL_MS = 1_500;
const BURST_DURATION_MS = 60_000;

export function MissionsPanel() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();
  const [data, setData] = useState<MissionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MissionFilter>("open");
  const [pendingKeys, setPendingKeys] = useState<string[]>(() => listPendingMissionKeys());
  const [completingKey, setCompletingKey] = useState<string | null>(null);

  const loadMissions = useCallback(async (walletAddress: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/missions?address=${walletAddress}`);
      const body = (await response.json()) as { data?: MissionsData; error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load missions");
      }

      setData(body.data ?? null);

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
      setError(err instanceof Error ? err.message : "Failed to load missions");
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

    /** Soft refresh — keep prior missions painted while refetching. */
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

  const completedCount = data?.missions.filter((m) => m.completed).length ?? 0;
  const openCount = data?.missions.filter((m) => !m.completed).length ?? 0;
  const totalCount = data?.missions.length ?? 0;
  const pointsToEarn =
    data?.missions.filter((m) => !m.completed).reduce((sum, m) => sum + m.rewardPoints, 0) ?? 0;

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
    return <MissionsGuestPanel onSignIn={() => openConnectModal?.()} />;
  }

  if (loading && !data) {
    return <MissionsPanelSkeleton />;
  }

  return (
    <div className="missions-page">
      <HubDiscoveryScrollLock />
      <div className="missions-hub">
        {data ? (
          <MissionsHero
            totalPoints={data.totalPoints}
            pointsToEarn={pointsToEarn}
            completedCount={completedCount}
            totalCount={totalCount}
            openCount={openCount}
            tradingVolumeBnb={data.tradingVolumeBnb}
          />
        ) : null}

        {error ? (
          <div className="missions-notice notice-error">
            {error}
            {error.includes("VM1_MAIN_DB_URL") ? (
              <p className="mt-2 field-hint">
                Local dev: SSH tunnel ui-app 7433 → localhost 17433 and set VM1_MAIN_DB_URL in .env
              </p>
            ) : null}
          </div>
        ) : null}

        {data && !error ? (
          <>
            <MissionsFilterNav
              activeFilter={activeFilter}
              filterCounts={filterCounts}
              loading={loading}
              onSelect={setActiveFilter}
              onRefresh={() => void loadMissions(address)}
            />

            <div className="missions-body">
              {boardMissions.length > 0 ? (
                <MissionsList
                  missions={boardMissions}
                  pendingKeys={pendingKeys}
                  completingKey={completingKey}
                  onAdminLinkClick={(mission) => void onAdminLinkClick(mission)}
                />
              ) : (
                <div className="empty-state missions-empty-state">
                  <p className="empty-state-copy">
                    {activeFilter === "done" ? "Nothing completed yet." : "All caught up."}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

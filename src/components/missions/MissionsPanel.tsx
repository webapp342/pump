"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import {
  listPendingMissionKeys,
  type OptimisticActivity,
} from "@/lib/optimistic-activity";
import { MissionsPanelSkeleton } from "@/components/missions/MissionsPanelSkeleton";

type MissionProgress = {
  current: number;
  target: number;
  unit: string;
};

type Mission = {
  taskKey: string;
  title: string;
  description: string | null;
  rewardPoints: number;
  taskKind: "DAILY" | "ONE_TIME" | "MILESTONE" | "ADMIN_LINK";
  taskSource?: "system" | "admin_link";
  targetUrl?: string | null;
  completed: boolean;
  completedAt: string | null;
  pointsAwarded: number;
  progress?: MissionProgress;
};

type MissionsData = {
  address: string;
  totalPoints: number;
  todayUtc: string;
  tradingVolumeBnb: number;
  missions: Mission[];
};

type MissionFilter = "all" | "open" | "done";

const BURST_POLL_MS = 1_500;
const BURST_DURATION_MS = 60_000;

const missionKindLabel: Record<Mission["taskKind"], string> = {
  DAILY: "Daily",
  ONE_TIME: "Once",
  MILESTONE: "Milestone",
  ADMIN_LINK: "Promo",
};

function isAdminLinkMission(mission: Mission): boolean {
  return mission.taskKind === "ADMIN_LINK" || mission.taskSource === "admin_link";
}

function missionStatusClass(done: boolean, syncing: boolean): string {
  if (done) return "text-pump-success";
  if (syncing) return "text-pump-warning";
  return "text-pump-muted";
}

function missionStatusLabel(done: boolean, syncing: boolean): string {
  if (done) return "Done";
  if (syncing) return "Syncing";
  return "Open";
}

function MissionRow({
  mission,
  syncing,
  onAdminLinkClick,
  completing,
}: {
  mission: Mission;
  syncing: boolean;
  onAdminLinkClick?: (mission: Mission) => void;
  completing?: boolean;
}) {
  const progressPct =
    mission.progress && mission.progress.target > 0
      ? Math.min(100, (mission.progress.current / mission.progress.target) * 100)
      : 0;

  const done = mission.completed;
  const showSyncing = syncing && !done;
  const isLinkTask = isAdminLinkMission(mission) && Boolean(mission.targetUrl);
  const clickable = isLinkTask && !done && !completing;

  const content = (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-body-sm font-medium text-pump-text">{mission.title}</p>
            <span className="text-[10px] font-medium uppercase tracking-wide text-pump-muted/80">
              {missionKindLabel[mission.taskKind]}
            </span>
          </div>
          {mission.description ? (
            <p className="mt-0.5 line-clamp-2 text-caption text-pump-muted">{mission.description}</p>
          ) : null}
          {isLinkTask && !done ? (
            <p className="mt-1 text-[11px] text-pump-accent">
              {completing ? "Completing…" : "Tap to open link and earn points"}
            </p>
          ) : null}
          {mission.progress && !done ? (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-pump-muted">
                <span className="financial-value tabular-nums text-pump-text">
                  {mission.progress.current.toFixed(2)} / {mission.progress.target}{" "}
                  {mission.progress.unit}
                </span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-pump-surface/70">
                <div
                  className="h-full rounded-full bg-pump-accent transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="financial-value text-body-sm font-semibold text-pump-accent">
            +{mission.rewardPoints}
          </span>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide ${missionStatusClass(done, showSyncing)}`}
          >
            {completing ? "Opening…" : missionStatusLabel(done, showSyncing)}
          </span>
        </div>
      </div>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-pump-surface/25 md:px-4 md:py-3"
        onClick={() => onAdminLinkClick?.(mission)}
        disabled={completing}
      >
        {content}
      </button>
    );
  }

  return (
    <article className="px-3 py-2.5 md:px-4 md:py-3">
      {content}
    </article>
  );
}

export function MissionsPanel() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
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

    setData(null);
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
    async (mission: Mission) => {
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
      all: totalCount,
      open: openCount,
      done: completedCount,
    }),
    [totalCount, openCount, completedCount]
  );

  const boardMissions = useMemo(() => {
    if (!data) return [];
    return data.missions.filter((mission) => {
      if (activeFilter === "open") return !mission.completed;
      if (activeFilter === "done") return mission.completed;
      return true;
    });
  }, [data, activeFilter]);

  if (!isConnected || !address) {
    return (
      <div className="panel-surface p-8 text-center">
        <p className="text-body-sm text-pump-muted">
          Connect your wallet to track Pump Points and mission progress.
        </p>
        <button
          type="button"
          onClick={() => openConnectModal?.()}
          className="primary-button mt-4 px-6"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return <MissionsPanelSkeleton />;
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {error ? (
        <div className="notice-error p-3">
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
          <section className="rounded-lg border border-pump-border/15 bg-pump-card/80 p-3 md:p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="section-label leading-none">Pump Points</p>
                <p className="financial-value mt-1 text-[1.75rem] font-semibold leading-none text-pump-accent md:text-display">
                  {data.totalPoints.toLocaleString()}
                </p>
              </div>
              <p className="text-right text-caption text-pump-muted">
                <span className="financial-value font-medium text-pump-text">
                  {completedCount}/{totalCount}
                </span>{" "}
                done
                <span className="mx-1.5 text-pump-muted/40">·</span>
                <span className="financial-value font-medium text-pump-text">
                  +{pointsToEarn.toLocaleString()}
                </span>{" "}
                left
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-pump-muted">
              <span>
                Vol{" "}
                <span className="financial-value font-medium text-pump-text">
                  {data.tradingVolumeBnb.toFixed(2)} BNB
                </span>
              </span>
              <span className="text-pump-muted/40">·</span>
              <span>Daily reset {data.todayUtc} UTC</span>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(
                [
                  ["open", "Open"],
                  ["all", "All"],
                  ["done", "Done"],
                ] as const
              ).map(([key, label]) => {
                const count = filterCounts[key] ?? 0;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveFilter(key)}
                    className={
                      activeFilter === key ? "chip-button chip-button-active" : "chip-button"
                    }
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => loadMissions(address)}
              disabled={loading}
              className="chip-button shrink-0 disabled:opacity-50"
            >
              {loading ? "…" : "Refresh"}
            </button>
          </div>

          <section className="rounded-lg border border-pump-border/15 bg-transparent">
            {boardMissions.length > 0 ? (
              <div className="divide-y divide-pump-border/10">
                {boardMissions.map((mission) => (
                  <MissionRow
                    key={mission.taskKey}
                    mission={mission}
                    syncing={pendingKeys.includes(mission.taskKey)}
                    onAdminLinkClick={(m) => void onAdminLinkClick(m)}
                    completing={completingKey === mission.taskKey}
                  />
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-body-sm text-pump-muted">
                {activeFilter === "done"
                  ? "Nothing completed yet."
                  : activeFilter === "open"
                    ? "All caught up."
                    : "No missions yet."}
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

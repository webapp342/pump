"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount } from "wagmi";
import {
  listPendingMissionKeys,
  type OptimisticActivity,
} from "@/lib/optimistic-activity";
import { getMissionHref, isAdminLinkMission } from "@/lib/mission-routes";
import { MissionsPanelSkeleton } from "@/components/missions/MissionsPanelSkeleton";
import { IconLabel } from "@/components/ui/IconLabel";
import { MetricIcons } from "@/lib/metric-icons";

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

function missionStatusLabel(done: boolean, syncing: boolean): string {
  if (done) return "Done";
  if (syncing) return "Syncing";
  return "Open";
}

function missionStatusBadgeClass(done: boolean, syncing: boolean): string {
  if (done) return "border-pump-success/40 bg-pump-success/10 text-pump-success";
  if (syncing) return "border-pump-warning/40 bg-pump-warning/10 text-pump-warning";
  return "border-pump-border/45 bg-pump-border/10 text-pump-muted";
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
  const router = useRouter();
  const progressPct =
    mission.progress && mission.progress.target > 0
      ? Math.min(100, (mission.progress.current / mission.progress.target) * 100)
      : 0;

  const done = mission.completed;
  const showSyncing = syncing && !done;
  const isLinkTask = isAdminLinkMission(mission) && Boolean(mission.targetUrl);
  const adminClickable = isLinkTask && !done && !completing;
  const href = getMissionHref(mission);
  const navigable = href != null;

  const cardClassName = [
    "mission-card",
    done ? "mission-card-done" : "",
    adminClickable || navigable ? "cursor-pointer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body-sm font-semibold text-pump-text">{mission.title}</h3>
          <span className="status-badge shrink-0">{missionKindLabel[mission.taskKind]}</span>
        </div>

        {mission.description ? (
          <p className="text-caption leading-relaxed text-pump-muted">{mission.description}</p>
        ) : null}

        {adminClickable ? (
          <p className="text-caption font-medium text-pump-accent">
            {completing ? "Completing…" : "Tap to open link and earn points"}
          </p>
        ) : navigable && !done ? (
          <p className="text-caption font-medium text-pump-accent">
            Tap to go to {href === "/create" ? "Create" : "Arena"}
          </p>
        ) : null}

        {mission.progress && !done ? (
          <div className="space-y-1.5 border-t border-pump-border/20 pt-2">
            <div className="flex items-center justify-between gap-2 text-caption text-pump-muted">
              <span className="financial-value tabular-nums text-pump-text">
                {mission.progress.current.toFixed(2)} / {mission.progress.target}{" "}
                {mission.progress.unit}
              </span>
              <span className="financial-value font-medium">{Math.round(progressPct)}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2 text-right">
        <span className="financial-value text-body font-semibold text-pump-accent">
          +{mission.rewardPoints}
        </span>
        <span className={`status-badge ${missionStatusBadgeClass(done, showSyncing)}`}>
          {completing ? "Opening…" : missionStatusLabel(done, showSyncing)}
        </span>
      </div>
    </div>
  );

  function handleClick() {
    if (adminClickable) {
      onAdminLinkClick?.(mission);
      return;
    }
    if (href) router.push(href);
  }

  if (adminClickable || navigable) {
    return (
      <button
        type="button"
        className={cardClassName}
        onClick={handleClick}
        disabled={completing}
      >
        {content}
      </button>
    );
  }

  return <article className={cardClassName}>{content}</article>;
}

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
      <div className="panel-surface empty-state">
        <p className="empty-state-copy">
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
          <section className="panel-surface p-4 md:p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <IconLabel icon={MetricIcons.pumpPoints} hideIconMobile className="section-label leading-none">
                  Pump Points
                </IconLabel>
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
            <div className="arena-filter-bar" role="tablist" aria-label="Mission filters">
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
                    role="tab"
                    aria-selected={activeFilter === key}
                    onClick={() => setActiveFilter(key)}
                    className={`arena-filter-chip ${
                      activeFilter === key ? "arena-filter-chip-active" : ""
                    }`}
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

          <section className="space-y-2">
            {boardMissions.length > 0 ? (
              boardMissions.map((mission) => (
                <MissionRow
                  key={mission.taskKey}
                  mission={mission}
                  syncing={pendingKeys.includes(mission.taskKey)}
                  onAdminLinkClick={(m) => void onAdminLinkClick(m)}
                  completing={completingKey === mission.taskKey}
                />
              ))
            ) : (
              <div className="panel-surface empty-state">
                <p className="empty-state-copy">
                  {activeFilter === "done"
                    ? "Nothing completed yet."
                    : activeFilter === "open"
                      ? "All caught up."
                      : "No missions yet."}
                </p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

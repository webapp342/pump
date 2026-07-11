"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/ui/InfoTip";
import { PumpIcon, faCheck } from "@/lib/icons";
import { getMissionHref, isAdminLinkMission } from "@/lib/mission-routes";
import type { MissionListItem } from "@/lib/missions-guest-data";
import {
  MISSION_KIND_LABEL,
  formatMissionProgress,
  getMissionActionLabel,
  missionInfoText,
  missionProgressPct,
  missionStatusLabel,
} from "@/lib/mission-ui";

type MissionRowProps = {
  mission: MissionListItem;
  syncing?: boolean;
  completing?: boolean;
  guestMode?: boolean;
  onAdminLinkClick?: (mission: MissionListItem) => void;
};

function MissionProgressCell({
  mission,
}: {
  mission: MissionListItem;
}) {
  const pct = missionProgressPct(mission.progress);
  const done = mission.completed;

  if (done) {
    return <span className="missions-list__dash">—</span>;
  }

  if (mission.progress && pct != null) {
    return (
      <div className="missions-list__progress">
        <div className="missions-list__progress-meta">
          <span className="financial-value tabular-nums">
            {formatMissionProgress(mission.progress)}
          </span>
          <span className="financial-value">{Math.round(pct)}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return null;
}

function missionHasProgressBar(mission: MissionListItem): boolean {
  if (mission.completed) return false;
  return mission.progress != null && missionProgressPct(mission.progress) != null;
}

export function MissionRow({
  mission,
  syncing = false,
  completing = false,
  guestMode = false,
  onAdminLinkClick,
}: MissionRowProps) {
  const router = useRouter();
  const done = mission.completed;
  const actionLabel = guestMode ? null : getMissionActionLabel(mission);
  const isLinkTask = isAdminLinkMission(mission) && Boolean(mission.targetUrl);
  const href = guestMode ? null : getMissionHref(mission);
  const interactive = !guestMode && !done && (isLinkTask || href != null);
  const hasProgressBar = missionHasProgressBar(mission);
  const kindLabel = MISSION_KIND_LABEL[mission.taskKind];

  const rowClassName = [
    "missions-list__row",
    done ? "missions-list__row--done" : "",
    hasProgressBar ? "missions-list__row--has-progress" : "",
    interactive ? "missions-list__row--interactive" : "",
    guestMode ? "missions-list__row--guest" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleAction() {
    if (guestMode || done) return;
    if (isLinkTask) {
      onAdminLinkClick?.(mission);
      return;
    }
    if (href) router.push(href);
  }

  const statusLabel = missionStatusLabel(done, syncing, completing);
  const infoText = missionInfoText(mission.description);

  const rowContent = (
    <>
      <div className="missions-list__cell missions-list__cell--mission">
        <div className="missions-list__title-row">
          <p className="missions-list__title">{mission.title}</p>
          {infoText ? (
            <InfoTip label={`About ${mission.title}`} className="missions-list__info">
              {infoText}
            </InfoTip>
          ) : null}
          <span className="missions-list__kind missions-list__kind--inline">{kindLabel}</span>
        </div>
        <p
          className={`missions-list__kind missions-list__kind--mobile${
            hasProgressBar ? " missions-list__kind--hide-mobile-progress" : ""
          }`}
        >
          {kindLabel}
        </p>
      </div>

      <div
        className={`missions-list__cell missions-list__cell--progress${
          !hasProgressBar || done ? " missions-list__cell--progress-empty" : ""
        }`}
      >
        <MissionProgressCell mission={mission} />
      </div>

      <div className="missions-list__cell missions-list__cell--reward">
        <span className="missions-list__reward financial-value">+{mission.rewardPoints}</span>
      </div>

      <div className="missions-list__cell missions-list__cell--status">
        {done ? (
          <span className="missions-list__status missions-list__status--done">
            <PumpIcon icon={faCheck} className="h-3 w-3" aria-hidden />
            <span>{statusLabel}</span>
          </span>
        ) : actionLabel ? (
          <button
            type="button"
            className="missions-list__action"
            onClick={handleAction}
            disabled={guestMode || completing}
          >
            {completing ? "Opening…" : actionLabel}
          </button>
        ) : (
          <span
            className={`missions-list__status${
              syncing ? " missions-list__status--syncing" : ""
            }`.trim()}
          >
            {statusLabel}
          </span>
        )}
      </div>
    </>
  );

  if (interactive) {
    return (
      <div className={rowClassName}>
        {rowContent}
      </div>
    );
  }

  return <div className={rowClassName}>{rowContent}</div>;
}

export function MissionsListHeader() {
  return (
    <div className="missions-list__head" aria-hidden>
      <span>Mission</span>
      <span>Progress</span>
      <span className="missions-list__head-num">Reward</span>
      <span className="missions-list__head-num">Status</span>
    </div>
  );
}

type MissionsListProps = {
  missions: MissionListItem[];
  guestMode?: boolean;
  pendingKeys?: string[];
  completingKey?: string | null;
  onAdminLinkClick?: (mission: MissionListItem) => void;
  footerSlot?: ReactNode;
};

export function MissionsList({
  missions,
  guestMode = false,
  pendingKeys = [],
  completingKey = null,
  onAdminLinkClick,
  footerSlot,
}: MissionsListProps) {
  return (
    <section className="missions-list">
      <MissionsListHeader />
      <div className="missions-list__scroll">
        <div className="missions-list__body">
          {missions.map((mission) => (
            <MissionRow
              key={mission.taskKey}
              mission={mission}
              guestMode={guestMode}
              syncing={pendingKeys.includes(mission.taskKey)}
              completing={completingKey === mission.taskKey}
              onAdminLinkClick={onAdminLinkClick}
            />
          ))}
        </div>
        {footerSlot}
      </div>
    </section>
  );
}

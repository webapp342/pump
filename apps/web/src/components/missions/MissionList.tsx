"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/ui/InfoTip";
import { PumpIcon, faCheck } from "@/lib/icons";
import { getMissionHref, isAdminLinkMission } from "@/lib/mission-routes";
import type { MissionListItem } from "@/lib/missions-guest-data";
import {
  formatMissionProgress,
  getMissionActionLabel,
  getMissionDisplayReward,
  isReferralInviteMission,
  missionInfoText,
  missionProgressPct,
  missionRewardSuffix,
  missionStatusLabel,
} from "@/lib/mission-ui";
import { REWARDS_CHALLENGES, REWARDS_HUB } from "@/lib/rewards-copy";

type MissionRowProps = {
  mission: MissionListItem;
  syncing?: boolean;
  completing?: boolean;
  guestMode?: boolean;
  onAdminLinkClick?: (mission: MissionListItem) => void;
  onReferralClaim?: (mission: MissionListItem) => void;
};

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
  onReferralClaim,
}: MissionRowProps) {
  const router = useRouter();
  const done = mission.completed;
  const actionLabel = guestMode ? null : getMissionActionLabel(mission);
  const isLinkTask = isAdminLinkMission(mission) && Boolean(mission.targetUrl);
  const href = guestMode ? null : getMissionHref(mission);
  const isReferralClaim =
    !guestMode && !done && isReferralInviteMission(mission) && actionLabel != null;
  const interactive =
    !guestMode && !done && (isReferralClaim || isLinkTask || href != null);
  const hasProgressBar = missionHasProgressBar(mission);
  const pct = missionProgressPct(mission.progress);
  const statusLabel = missionStatusLabel(done, syncing, completing, mission);
  const infoText = missionInfoText(mission.description);
  const displayReward = getMissionDisplayReward(mission);
  const rewardSuffix = missionRewardSuffix(mission);

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
    if (isReferralClaim) {
      onReferralClaim?.(mission);
      return;
    }
    if (isLinkTask) {
      onAdminLinkClick?.(mission);
      return;
    }
    if (href) router.push(href);
  }

  return (
    <div className={rowClassName}>
      <div className="missions-list__primary">
        <div className="missions-list__copy">
          <div className="missions-list__title-row">
            <p className="missions-list__title">{mission.title}</p>
            {infoText ? (
              <InfoTip label={`About ${mission.title}`} className="missions-list__info">
                {infoText}
              </InfoTip>
            ) : null}
          </div>
        </div>

        {hasProgressBar && pct != null && mission.progress ? (
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
        ) : null}

        <div className="missions-list__trail">
          <span className="missions-list__reward financial-value">
            +{displayReward} {REWARDS_HUB.unitShort}
            {rewardSuffix ? ` ${rewardSuffix}` : ""}
          </span>
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
              {completing
                ? isReferralClaim
                  ? "Claiming…"
                  : "Opening…"
                : actionLabel}
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
      </div>
    </div>
  );
}

export function MissionsListHeader() {
  return (
    <div className="missions-list__head" aria-hidden>
      <span>{REWARDS_CHALLENGES.columnTitle}</span>
      <span className="missions-list__head-num">{REWARDS_CHALLENGES.columnReward}</span>
      <span className="missions-list__head-num">{REWARDS_CHALLENGES.columnStatus}</span>
    </div>
  );
}

type MissionsListProps = {
  missions: MissionListItem[];
  guestMode?: boolean;
  pendingKeys?: string[];
  completingKey?: string | null;
  onAdminLinkClick?: (mission: MissionListItem) => void;
  onReferralClaim?: (mission: MissionListItem) => void;
  footerSlot?: ReactNode;
};

export function MissionsList({
  missions,
  guestMode = false,
  pendingKeys = [],
  completingKey = null,
  onAdminLinkClick,
  onReferralClaim,
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
              onReferralClaim={onReferralClaim}
            />
          ))}
        </div>
        {footerSlot}
      </div>
    </section>
  );
}

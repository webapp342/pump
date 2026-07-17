import type { PumpIconDefinition } from "@/lib/icons";
import {
  faAirdropParachute,
  faBolt,
  faRocket,
  faRightLeft,
  faLink,
  faUsers,
} from "@/lib/pump-icons";
import { getMissionHref, isAdminLinkMission } from "@/lib/mission-routes";
import type { MissionListItem } from "@/lib/missions-guest-data";

const DEPLOY_MEME_TASK_KEY = "LAUNCHPAD_DEPLOY_MEME";
const DAILY_SWAP_TASK_KEY = "LAUNCHPAD_DAILY_SWAP";
const FIRST_SMART_BUY_TASK_KEY = "LAUNCHPAD_FIRST_SMART_BUY";
const REFERRAL_INVITE_XP_TASK_KEY = "LAUNCHPAD_REFERRAL_INVITE_XP";
const VOLUME_MONSTER_TASK_KEY = "LAUNCHPAD_VOLUME_MONSTER";

export const MISSION_KIND_LABEL: Record<MissionListItem["taskKind"], string> = {
  DAILY: "Daily",
  ONE_TIME: "Once",
  MILESTONE: "Milestone",
  ADMIN_LINK: "Promo",
};

export function isReferralInviteMission(
  mission: Pick<MissionListItem, "taskKey">
): boolean {
  return mission.taskKey === REFERRAL_INVITE_XP_TASK_KEY;
}

export function missionIcon(mission: Pick<MissionListItem, "taskKey" | "taskKind">): PumpIconDefinition {
  switch (mission.taskKey) {
    case DAILY_SWAP_TASK_KEY:
    case FIRST_SMART_BUY_TASK_KEY:
    case VOLUME_MONSTER_TASK_KEY:
      return faRightLeft;
    case REFERRAL_INVITE_XP_TASK_KEY:
      return faUsers;
    case DEPLOY_MEME_TASK_KEY:
      return faRocket;
    default:
      if (mission.taskKind === "ADMIN_LINK") return faLink;
      if (mission.taskKind === "MILESTONE") return faBolt;
      if (mission.taskKind === "DAILY") return faAirdropParachute;
      return faBolt;
  }
}

type MissionActionInput = Pick<
  MissionListItem,
  "taskKey" | "taskKind" | "taskSource" | "targetUrl" | "completed" | "referralClaim"
>;

export function getMissionDisplayReward(mission: MissionListItem): number {
  if (mission.referralClaim && mission.referralClaim.claimableCount > 0) {
    return mission.referralClaim.claimablePoints;
  }
  if (mission.referralClaim) {
    return mission.referralClaim.pointsPerInvite;
  }
  return mission.rewardPoints;
}

export function missionRewardSuffix(mission: MissionListItem): string | null {
  if (mission.referralClaim && mission.referralClaim.claimableCount === 0) {
    return "each";
  }
  return null;
}

export function getMissionActionLabel(mission: MissionActionInput): string | null {
  if (mission.completed) return null;
  if (isReferralInviteMission(mission)) {
    const count = mission.referralClaim?.claimableCount ?? 0;
    if (count <= 0) return null;
    return count === 1 ? "Claim" : `Claim (${count})`;
  }
  if (isAdminLinkMission(mission)) return "Open link";
  if (mission.taskKey === DEPLOY_MEME_TASK_KEY) return "Create";
  if (getMissionHref(mission)) return "Trade";
  return null;
}

export function missionProgressPct(
  progress: MissionListItem["progress"]
): number | null {
  if (!progress || progress.target <= 0) return null;
  return Math.min(100, (progress.current / progress.target) * 100);
}

export function formatMissionProgress(progress: NonNullable<MissionListItem["progress"]>): string {
  const current =
    progress.current >= 1 || progress.target >= 1
      ? progress.current.toFixed(2)
      : progress.current.toFixed(4);
  const target =
    progress.target >= 1 || progress.current >= 1
      ? progress.target.toFixed(2)
      : progress.target.toFixed(4);
  return `${current} / ${target} ${progress.unit}`;
}

export function missionStatusLabel(
  done: boolean,
  syncing: boolean,
  completing?: boolean,
  mission?: Pick<MissionListItem, "taskKey" | "referralClaim">
): string {
  if (done) return "Complete";
  if (completing) {
    if (mission && isReferralInviteMission(mission)) return "Claiming";
    return "Opening";
  }
  if (syncing) return "Syncing";
  if (mission && isReferralInviteMission(mission)) {
    const claimable = mission.referralClaim?.claimableCount ?? 0;
    if (claimable > 0) return "Ready";
    return "Waiting";
  }
  return "Open";
}

export function missionInfoText(description: string | null | undefined): string | null {
  const text = description?.trim();
  return text ? text : null;
}

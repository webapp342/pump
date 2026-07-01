import { getMissionHref, isAdminLinkMission } from "@/lib/mission-routes";
import type { MissionListItem } from "@/lib/missions-guest-data";

const DEPLOY_MEME_TASK_KEY = "LAUNCHPAD_DEPLOY_MEME";

export const MISSION_KIND_LABEL: Record<MissionListItem["taskKind"], string> = {
  DAILY: "Daily",
  ONE_TIME: "Once",
  MILESTONE: "Milestone",
  ADMIN_LINK: "Promo",
};

type MissionActionInput = Pick<
  MissionListItem,
  "taskKey" | "taskKind" | "taskSource" | "targetUrl" | "completed"
>;

export function getMissionActionLabel(mission: MissionActionInput): string | null {
  if (mission.completed) return null;
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
  completing?: boolean
): string {
  if (done) return "Complete";
  if (completing) return "Opening";
  if (syncing) return "Syncing";
  return "Open";
}

export function missionInfoText(description: string | null | undefined): string | null {
  const text = description?.trim();
  return text ? text : null;
}

const DEPLOY_MEME_TASK_KEY = "LAUNCHPAD_DEPLOY_MEME";

type MissionRouteInput = {
  taskKey: string;
  taskKind: "DAILY" | "ONE_TIME" | "MILESTONE" | "ADMIN_LINK";
  taskSource?: "system" | "admin_link";
  targetUrl?: string | null;
};

export function isAdminLinkMission(mission: MissionRouteInput): boolean {
  return mission.taskKind === "ADMIN_LINK" || mission.taskSource === "admin_link";
}

/** In-app destination for system missions. Admin-link promos use targetUrl instead. */
export function getMissionHref(mission: MissionRouteInput): string | null {
  if (isAdminLinkMission(mission)) return null;
  if (mission.taskKey === DEPLOY_MEME_TASK_KEY) return "/create";
  return "/";
}

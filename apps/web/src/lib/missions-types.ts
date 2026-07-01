export type MissionFilter = "all" | "open" | "done";

export type MissionProgress = {
  current: number;
  target: number;
  unit: string;
};

export type Mission = {
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

export type MissionsData = {
  address: string;
  totalPoints: number;
  todayUtc: string;
  tradingVolumeBnb: number;
  missions: Mission[];
};

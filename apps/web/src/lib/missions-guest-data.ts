import type { MissionFilter } from "@/lib/missions-types";
import type { ReferralInviteClaimMeta } from "@/lib/missions-types";

export type MissionListItem = {
  taskKey: string;
  title: string;
  description?: string | null;
  rewardPoints: number;
  taskKind: "DAILY" | "ONE_TIME" | "MILESTONE" | "ADMIN_LINK";
  taskSource?: "system" | "admin_link";
  targetUrl?: string | null;
  completed: boolean;
  progress?: {
    current: number;
    target: number;
    unit: string;
  };
  referralClaim?: ReferralInviteClaimMeta;
};

/** Static preview rows — same shape as live missions for guest placeholder UI. */
export const GUEST_MISSION_ROWS: MissionListItem[] = [
  {
    taskKey: "LAUNCHPAD_DAILY_SWAP",
    title: "Daily Swap",
    description: "Complete one buy or sell on any meme today (UTC).",
    rewardPoints: 20,
    taskKind: "DAILY",
    completed: false,
  },
  {
    taskKey: "LAUNCHPAD_DEPLOY_MEME",
    title: "Launch Your Meme",
    description: "Create your own token on the launchpad.",
    rewardPoints: 200,
    taskKind: "ONE_TIME",
    completed: false,
  },
  {
    taskKey: "LAUNCHPAD_FIRST_SMART_BUY",
    title: "First Smart Buy",
    description: "Buy at least 0.01 BNB of any meme token.",
    rewardPoints: 100,
    taskKind: "ONE_TIME",
    completed: false,
    progress: { current: 0, target: 0.01, unit: "BNB" },
  },
  {
    taskKey: "LAUNCHPAD_REFERRAL_INVITE_XP",
    title: "Referral Invites",
    description: "Invite friends and earn XP when they start trading.",
    rewardPoints: 50,
    taskKind: "MILESTONE",
    completed: false,
  },
  {
    taskKey: "LAUNCHPAD_VOLUME_MONSTER",
    title: "Volume Monster",
    description: "Reach 1 BNB in cumulative trading volume.",
    rewardPoints: 300,
    taskKind: "MILESTONE",
    completed: false,
    progress: { current: 0, target: 1, unit: "BNB" },
  },
];

export function guestMissionFilterCounts(): Record<MissionFilter, number> {
  const total = GUEST_MISSION_ROWS.length;
  return { open: total, done: 0 };
}

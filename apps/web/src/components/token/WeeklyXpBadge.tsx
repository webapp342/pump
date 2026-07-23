"use client";

import Link from "next/link";
import { useWeeklyXp } from "@/hooks/useWeeklyXp";
import { REWARDS_WEEKLY_XP } from "@/lib/rewards-copy";

type WeeklyXpBadgeProps = {
  walletAddress: string | null | undefined;
  refreshKey?: number;
  className?: string;
};

export function WeeklyXpBadge({
  walletAddress,
  refreshKey = 0,
  className = "",
}: WeeklyXpBadgeProps) {
  const { data, loading } = useWeeklyXp(walletAddress, refreshKey);

  if (!walletAddress?.trim()) return null;

  const xp = data?.weeklyXp ?? 0;
  const eligible = data?.cashbackEligible ?? false;

  return (
    <Link
      href="/missions?tab=leaderboard"
      className={`weekly-xp-badge ${className}`.trim()}
      title={REWARDS_WEEKLY_XP.badgeTitle}
    >
      <span className="weekly-xp-badge__label">{REWARDS_WEEKLY_XP.badgeLabel}</span>
      <span className="weekly-xp-badge__value financial-value">
        {loading && data == null ? "…" : xp.toLocaleString()}
      </span>
      {eligible ? (
        <span className="weekly-xp-badge__pill">{REWARDS_WEEKLY_XP.cashbackOn}</span>
      ) : null}
    </Link>
  );
}

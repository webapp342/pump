"use client";

import { NATIVE_SYMBOL } from "@/config/chain";
import { PumpIcon } from "@/lib/icons";
import { MetricIcons } from "@/lib/metric-icons";
import type { PointsLevelStatus } from "@/lib/points-levels";

type PointsStatusCardProps = {
  level: PointsLevelStatus;
  /** Spendable balance (users.points). */
  spendablePoints: number;
  pointsToEarn: number;
  completedCount: number;
  totalCount: number;
  openCount: number;
  tradingVolumeBnb: number;
  guestMode?: boolean;
  /** Compact sidebar variant (desktop left rail). */
  variant?: "hero" | "rail";
};

export function PointsStatusCard({
  level,
  spendablePoints,
  pointsToEarn,
  completedCount,
  totalCount,
  openCount,
  tradingVolumeBnb,
  guestMode = false,
  variant = "hero",
}: PointsStatusCardProps) {
  const balance = guestMode ? 0 : spendablePoints;
  const pct = Math.round(level.progress * 100);
  const nextLabel = level.nextTier
    ? `${(level.pointsToNext ?? 0).toLocaleString()} pts to ${level.nextTier.name}`
    : "Max tier reached";

  return (
    <section
      className={`points-status panel-surface${variant === "rail" ? " points-status--rail" : ""}`}
      aria-label="Pump Points status"
    >
      <div className="points-status__top">
        <div className="points-status__brand">
          <PumpIcon icon={MetricIcons.pumpPoints} size="sm" className="points-status__brand-icon" />
          <span className="section-label">Pump Points</span>
        </div>
        <span className="points-status__tier chip-button points-status__tier-chip" aria-label={`Level ${level.tier.name}`}>
          {level.tier.name}
        </span>
      </div>

      <p className="points-status__balance financial-value text-pump-accent">
        {balance.toLocaleString()}
        <span className="points-status__balance-unit">pts</span>
      </p>

      <p className="points-status__earn">
        <span className="financial-value text-pump-accent">+{pointsToEarn.toLocaleString()}</span>
        <span className="points-status__earn-label"> available to earn</span>
      </p>

      <div className="points-status__level">
        <div className="points-status__level-meta">
          <span className="type-legal text-pump-muted">{nextLabel}</span>
          {level.nextTier ? (
            <span className="financial-value type-legal text-pump-muted">{pct}%</span>
          ) : null}
        </div>
        <div className="progress-track points-status__progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="points-status__stats">
        <div className="points-status__stat">
          <span className="section-label">Completed</span>
          <span className="financial-value">
            {guestMode ? "0" : completedCount}
            <span className="points-status__stat-suffix">/{totalCount}</span>
          </span>
        </div>
        <div className="points-status__stat">
          <span className="section-label">Open</span>
          <span className="financial-value">{guestMode ? totalCount : openCount}</span>
        </div>
        <div className="points-status__stat">
          <span className="section-label">Volume</span>
          <span className="financial-value">
            {guestMode ? "0.00" : tradingVolumeBnb.toFixed(2)}{" "}
            <span className="points-status__stat-suffix">{NATIVE_SYMBOL}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

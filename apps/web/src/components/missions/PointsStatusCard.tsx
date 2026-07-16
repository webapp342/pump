"use client";

import { InfoTip } from "@/components/ui/InfoTip";
import { POINTS_TIERS, type PointsLevelStatus } from "@/lib/points-levels";
import { REWARDS_HUB, REWARDS_RANKS, REWARDS_STATUS } from "@/lib/rewards-copy";

type PointsStatusCardProps = {
  level: PointsLevelStatus;
  /** Spendable balance (users.points). */
  spendablePoints: number;
  guestMode?: boolean;
};

export function PointsStatusCard({
  level,
  spendablePoints,
  guestMode = false,
}: PointsStatusCardProps) {
  const balance = guestMode ? 0 : spendablePoints;
  const pct = Math.round(level.progress * 100);
  const nextLabel = level.nextTier
    ? REWARDS_STATUS.toNext(level.pointsToNext ?? 0, level.nextTier.name)
    : REWARDS_STATUS.maxTier;
  const currentIndex = guestMode ? 0 : level.tierIndex;

  return (
    <section className="points-status" aria-label={REWARDS_HUB.statusAria}>
      <div className="points-status__header">
        <span className="section-label">{REWARDS_STATUS.availableLabel}</span>
        <div className="points-status__rank type-legal">
          <span className="points-status__rank-name">{level.tier.name}</span>
          <InfoTip
            label={REWARDS_RANKS.tipLabel}
            className="points-status__rank-tip"
            panelClassName="info-tip__panel--ranks"
          >
            <p className="points-status__rank-tip-desc">{REWARDS_RANKS.description}</p>
            <div className="points-status__rank-tip-table" role="list">
              <div className="points-status__rank-tip-head" aria-hidden>
                <span>{REWARDS_RANKS.heading}</span>
                <span>{REWARDS_RANKS.thresholdLabel}</span>
              </div>
              {POINTS_TIERS.map((tier, index) => {
                const current = !guestMode && index === currentIndex;
                return (
                  <div
                    key={tier.id}
                    role="listitem"
                    className={`points-status__rank-tip-row${
                      current ? " points-status__rank-tip-row--current" : ""
                    }`}
                  >
                    <span className="points-status__rank-tip-name">{tier.name}</span>
                    <span className="financial-value points-status__rank-tip-xp">
                      {tier.minPoints.toLocaleString()} {REWARDS_HUB.unitShort}
                    </span>
                  </div>
                );
              })}
            </div>
          </InfoTip>
        </div>
      </div>

      <p className="points-status__balance financial-value text-pump-accent">
        {balance.toLocaleString()}
        <span className="points-status__balance-unit">{REWARDS_HUB.unitShort}</span>
      </p>

      <div className="points-status__level">
        <div
          className="progress-track points-status__progress"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={nextLabel}
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="points-status__level-meta">
          <span className="type-legal text-pump-muted">{nextLabel}</span>
          {level.nextTier ? (
            <span className="financial-value type-legal text-pump-muted">{pct}%</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

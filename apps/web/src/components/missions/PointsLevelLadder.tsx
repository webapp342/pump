"use client";

import { POINTS_TIERS, type PointsLevelStatus } from "@/lib/points-levels";
import { PumpIcon, faCheck } from "@/lib/icons";

type PointsLevelLadderProps = {
  level: PointsLevelStatus;
  guestMode?: boolean;
  /** Compact mini ladder for overview / rail. */
  compact?: boolean;
};

export function PointsLevelLadder({
  level,
  guestMode = false,
  compact = false,
}: PointsLevelLadderProps) {
  const currentIndex = guestMode ? 0 : level.tierIndex;

  return (
    <section
      className={`points-level-ladder${compact ? " points-level-ladder--compact" : ""}`}
      aria-label="Loyalty levels"
    >
      {!compact ? (
        <header className="points-level-ladder__head">
          <h2 className="section-heading">Levels</h2>
          <p className="type-legal text-pump-muted">
            Lifetime Pump Points unlock tiers and perks. Higher tiers open Market items earlier.
          </p>
        </header>
      ) : null}

      <ol className="points-level-ladder__list">
        {POINTS_TIERS.map((tier, index) => {
          const reached = index <= currentIndex;
          const current = !guestMode && index === currentIndex;
          return (
            <li
              key={tier.id}
              className={[
                "points-level-ladder__item",
                reached ? "points-level-ladder__item--reached" : "",
                current ? "points-level-ladder__item--current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="points-level-ladder__marker" aria-hidden>
                {reached ? (
                  <PumpIcon icon={faCheck} size="xs" active className="points-level-ladder__check" />
                ) : (
                  <span className="points-level-ladder__dot" />
                )}
              </div>
              <div className="points-level-ladder__body">
                <div className="points-level-ladder__title-row">
                  <span className="points-level-ladder__name">{tier.name}</span>
                  <span className="financial-value type-legal text-pump-muted">
                    {tier.minPoints.toLocaleString()} pts
                  </span>
                </div>
                {!compact ? (
                  <p className="points-level-ladder__perk type-legal text-pump-muted">{tier.perk}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

"use client";

import { PumpIcon } from "@/lib/icons";
import {
  POINTS_MARKET_CATALOG,
  getFeaturedMarketItems,
  type PointsMarketItem,
} from "@/lib/points-market-catalog";
import { POINTS_TIERS, type PointsLevelStatus, type PointsTierId } from "@/lib/points-levels";

function tierName(id: PointsTierId): string {
  return POINTS_TIERS.find((t) => t.id === id)?.name ?? id;
}

function tierIndex(id: PointsTierId): number {
  return POINTS_TIERS.findIndex((t) => t.id === id);
}

type PointsMarketCardProps = {
  item: PointsMarketItem;
  level: PointsLevelStatus;
  spendablePoints: number;
  guestMode?: boolean;
  redeemingId?: string | null;
  onRedeem?: (item: PointsMarketItem) => void;
};

function PointsMarketCard({
  item,
  level,
  spendablePoints,
  guestMode = false,
  redeemingId = null,
  onRedeem,
}: PointsMarketCardProps) {
  const unlocked = !guestMode && level.tierIndex >= tierIndex(item.unlockTier);
  const canAfford = !guestMode && spendablePoints >= item.costPts;
  const canRedeem = unlocked && canAfford && Boolean(onRedeem);
  const busy = redeemingId === item.id;

  let cta = "Coming soon";
  if (guestMode) cta = "Sign in to redeem";
  else if (!unlocked) cta = `Unlocks at ${tierName(item.unlockTier)}`;
  else if (!canAfford) cta = "Not enough pts";
  else if (canRedeem) cta = busy ? "Redeeming…" : "Redeem";

  return (
    <article className="points-market-card panel-surface">
      <div className="points-market-card__icon-wrap" aria-hidden>
        <PumpIcon icon={item.icon} size="md" className="points-market-card__icon" />
      </div>
      <div className="points-market-card__body">
        <h3 className="points-market-card__title">{item.title}</h3>
        <p className="points-market-card__desc type-legal text-pump-muted">{item.description}</p>
        <div className="points-market-card__meta">
          <span className="financial-value text-pump-accent">{item.costPts.toLocaleString()} pts</span>
          <span className="type-legal text-pump-muted">
            Unlocks at {tierName(item.unlockTier)}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={canRedeem ? "primary-button points-market-card__cta" : "secondary-button points-market-card__cta"}
        disabled={!canRedeem || busy}
        onClick={() => onRedeem?.(item)}
      >
        {cta}
      </button>
    </article>
  );
}

type PointsMarketGridProps = {
  level: PointsLevelStatus;
  spendablePoints: number;
  guestMode?: boolean;
  featuredOnly?: boolean;
  onRedeem?: (item: PointsMarketItem) => void;
  redeemingId?: string | null;
};

export function PointsMarketGrid({
  level,
  spendablePoints,
  guestMode = false,
  featuredOnly = false,
  onRedeem,
  redeemingId = null,
}: PointsMarketGridProps) {
  const items = featuredOnly ? getFeaturedMarketItems(3) : [...POINTS_MARKET_CATALOG];

  return (
    <section className="points-market" aria-label="Points market">
      {!featuredOnly ? (
        <header className="points-market__head">
          <h2 className="section-heading">Market</h2>
          <p className="type-legal text-pump-muted">
            Spend Pump Points on boosts and access. Redeemed items appear in Activity → Inventory.
          </p>
        </header>
      ) : (
        <header className="points-market__head points-market__head--compact">
          <h2 className="section-heading">Featured rewards</h2>
        </header>
      )}
      <div className="points-market__grid">
        {items.map((item) => (
          <PointsMarketCard
            key={item.id}
            item={item}
            level={level}
            spendablePoints={spendablePoints}
            guestMode={guestMode}
            redeemingId={redeemingId}
            onRedeem={guestMode ? undefined : onRedeem}
          />
        ))}
      </div>
    </section>
  );
}

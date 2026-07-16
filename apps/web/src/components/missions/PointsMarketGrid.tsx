"use client";

import { PumpIcon } from "@/lib/icons";
import {
  POINTS_MARKET_CATALOG,
  isMarketItemStackable,
  type PointsMarketItem,
} from "@/lib/points-market-catalog";
import { POINTS_TIERS, type PointsLevelStatus, type PointsTierId } from "@/lib/points-levels";
import { REWARDS_HUB, REWARDS_MARKET } from "@/lib/rewards-copy";

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
  ownedItemIds?: Set<string>;
  onRedeem?: (item: PointsMarketItem) => void;
};

function PointsMarketCard({
  item,
  level,
  spendablePoints,
  guestMode = false,
  redeemingId = null,
  ownedItemIds,
  onRedeem,
}: PointsMarketCardProps) {
  const unlocked = !guestMode && level.tierIndex >= tierIndex(item.unlockTier);
  const canAfford = !guestMode && spendablePoints >= item.costPts;
  const alreadyOwned = !isMarketItemStackable(item) && Boolean(ownedItemIds?.has(item.id));
  const redeemable =
    !item.comingSoon && unlocked && canAfford && !alreadyOwned && Boolean(onRedeem);
  const busy = redeemingId === item.id;

  let cta = "Redeem";
  if (guestMode) cta = "Sign in to redeem";
  else if (item.comingSoon) cta = "Coming soon";
  else if (alreadyOwned) cta = "Owned";
  else if (!unlocked) cta = `Unlocks at ${tierName(item.unlockTier)}`;
  else if (!canAfford) cta = `Not enough ${REWARDS_HUB.unitShort}`;
  else if (busy) cta = "Redeeming…";

  return (
    <article className="points-market-card panel-surface">
      <div className="points-market-card__top">
        <div className="points-market-card__icon-wrap" aria-hidden>
          <PumpIcon icon={item.icon} size="md" className="points-market-card__icon" />
        </div>
        <div className="points-market-card__meta">
          <span className="financial-value text-pump-accent">
            {item.costPts.toLocaleString()} {REWARDS_HUB.unitShort}
          </span>
          <span className="type-legal text-pump-muted">
            Unlocks at {tierName(item.unlockTier)}
          </span>
        </div>
      </div>
      <div className="points-market-card__body">
        <h3 className="points-market-card__title">{item.title}</h3>
        <p className="points-market-card__desc type-legal text-pump-muted">{item.description}</p>
      </div>
      <button
        type="button"
        className={redeemable ? "primary-button points-market-card__cta" : "secondary-button points-market-card__cta"}
        disabled={!redeemable || busy}
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
  onRedeem?: (item: PointsMarketItem) => void;
  redeemingId?: string | null;
  ownedItemIds?: Set<string>;
};

export function PointsMarketGrid({
  level,
  spendablePoints,
  guestMode = false,
  onRedeem,
  redeemingId = null,
  ownedItemIds,
}: PointsMarketGridProps) {
  const items = [...POINTS_MARKET_CATALOG];

  return (
    <section className="points-market" aria-label={REWARDS_MARKET.shopAria}>
      <div className="points-market__grid">
        {items.map((item) => (
          <PointsMarketCard
            key={item.id}
            item={item}
            level={level}
            spendablePoints={spendablePoints}
            guestMode={guestMode}
            redeemingId={redeemingId}
            ownedItemIds={ownedItemIds}
            onRedeem={guestMode ? undefined : onRedeem}
          />
        ))}
      </div>
    </section>
  );
}

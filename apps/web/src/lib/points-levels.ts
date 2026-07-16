export type PointsTierId = "rookie" | "trader" | "pro" | "elite" | "cyclops";

export type PointsTier = {
  id: PointsTierId;
  name: string;
  /** Inclusive minimum lifetime points for this tier. */
  minPoints: number;
  perk: string;
};

/** Lifetime points → loyalty tier (V1 hardcode; admin later). */
export const POINTS_TIERS: readonly PointsTier[] = [
  { id: "rookie", name: "Rookie", minPoints: 0, perk: "Profile badge · 10% cashback tiers (soon)." },
  {
    id: "trader",
    name: "Trader",
    minPoints: 500,
    perk: "Launch spotlight · 25% cashback tiers (soon).",
  },
  {
    id: "pro",
    name: "Pro",
    minPoints: 2_000,
    perk: "Airdrop multiplier · 60% cashback tiers (soon).",
  },
  {
    id: "elite",
    name: "Elite",
    minPoints: 7_500,
    perk: "90% cashback tiers (soon).",
  },
  {
    id: "cyclops",
    name: "Cyclops",
    minPoints: 25_000,
    perk: "Top rank — full catalog access.",
  },
] as const;

export type PointsLevelStatus = {
  points: number;
  tier: PointsTier;
  tierIndex: number;
  nextTier: PointsTier | null;
  pointsToNext: number | null;
  /** 0–1 progress within current → next tier span. Max tier = 1. */
  progress: number;
};

export function getPointsLevel(points: number): PointsLevelStatus {
  const safe = Math.max(0, Math.floor(points));
  let tierIndex = 0;
  for (let i = POINTS_TIERS.length - 1; i >= 0; i--) {
    if (safe >= POINTS_TIERS[i].minPoints) {
      tierIndex = i;
      break;
    }
  }

  const tier = POINTS_TIERS[tierIndex];
  const nextTier = POINTS_TIERS[tierIndex + 1] ?? null;

  if (!nextTier) {
    return {
      points: safe,
      tier,
      tierIndex,
      nextTier: null,
      pointsToNext: null,
      progress: 1,
    };
  }

  const span = nextTier.minPoints - tier.minPoints;
  const gained = safe - tier.minPoints;
  const progress = span > 0 ? Math.min(1, Math.max(0, gained / span)) : 1;

  return {
    points: safe,
    tier,
    tierIndex,
    nextTier,
    pointsToNext: Math.max(0, nextTier.minPoints - safe),
    progress,
  };
}

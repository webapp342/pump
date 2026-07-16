import type { PointsTierId } from "@/lib/points-levels";
import type { PumpIconDefinition } from "@/lib/icons";
import {
  faAirdropParachute,
  faCoins,
  faPercent,
  faRocket,
  faStarRegular,
} from "@/lib/pump-icons";

export type PointsMarketItemId =
  | "status_badge"
  | "launch_boost"
  | "airdrop_weight"
  | "cashback_10_daily"
  | "cashback_10_weekly"
  | "cashback_10_monthly"
  | "cashback_25_daily"
  | "cashback_25_weekly"
  | "cashback_25_monthly"
  | "cashback_60_daily"
  | "cashback_60_weekly"
  | "cashback_60_monthly"
  | "cashback_90_daily"
  | "cashback_90_weekly"
  | "cashback_90_monthly";

export type PointsMarketItem = {
  id: PointsMarketItemId;
  title: string;
  description: string;
  costPts: number;
  unlockTier: PointsTierId;
  featured?: boolean;
  icon: PumpIconDefinition;
  /** false = one redeem ever (e.g. profile badge). Default true. */
  stackable?: boolean;
  /** Catalog placeholder — not redeemable yet. */
  comingSoon?: boolean;
};

type CashbackPeriod = "daily" | "weekly" | "monthly";
type CashbackRate = 10 | 25 | 60 | 90;

const CASHBACK_PERIOD: Record<
  CashbackPeriod,
  { label: string; duration: string; costMul: number }
> = {
  daily: { label: "Daily", duration: "24h", costMul: 1 },
  weekly: { label: "Weekly", duration: "7 days", costMul: 5 },
  monthly: { label: "Monthly", duration: "30 days", costMul: 18 },
};

const CASHBACK_RATE: Record<
  CashbackRate,
  { baseCost: number; unlockTier: PointsTierId; featuredPeriod?: CashbackPeriod }
> = {
  10: { baseCost: 300, unlockTier: "rookie", featuredPeriod: "daily" },
  25: { baseCost: 750, unlockTier: "trader" },
  60: { baseCost: 2_000, unlockTier: "pro" },
  90: { baseCost: 4_500, unlockTier: "elite", featuredPeriod: "monthly" },
};

function cashbackItem(
  rate: CashbackRate,
  period: CashbackPeriod
): PointsMarketItem {
  const rateCfg = CASHBACK_RATE[rate];
  const periodCfg = CASHBACK_PERIOD[period];
  const id = `cashback_${rate}_${period}` as PointsMarketItemId;
  return {
    id,
    title: `${rate}% ${periodCfg.label} cashback`,
    description: `${rate}% fee cashback for ${periodCfg.duration}. Coming soon.`,
    costPts: Math.round(rateCfg.baseCost * periodCfg.costMul),
    unlockTier: rateCfg.unlockTier,
    featured: rateCfg.featuredPeriod === period,
    stackable: true,
    comingSoon: true,
    icon: period === "daily" ? faPercent : faCoins,
  };
}

const CASHBACK_CATALOG: PointsMarketItem[] = (
  [10, 25, 60, 90] as const
).flatMap((rate) =>
  (["daily", "weekly", "monthly"] as const).map((period) => cashbackItem(rate, period))
);

/**
 * Perks catalog — redeem spends XP into `points_inventory`.
 * `comingSoon` items are display-only until effects ship.
 */
export const POINTS_MARKET_CATALOG: readonly PointsMarketItem[] = [
  {
    id: "status_badge",
    title: "Profile badge",
    description: "One-time. Badge next to your name on profile.",
    costPts: 150,
    unlockTier: "rookie",
    featured: true,
    stackable: false,
    icon: faStarRegular,
  },
  {
    id: "launch_boost",
    title: "Launch spotlight",
    description: "Pin any of your launched tokens in Arena for 24h.",
    costPts: 800,
    unlockTier: "trader",
    featured: true,
    stackable: true,
    icon: faRocket,
  },
  {
    id: "airdrop_weight",
    title: "Airdrop multiplier",
    description: "1.5× score on one campaign. Buy again anytime.",
    costPts: 1_200,
    unlockTier: "pro",
    featured: true,
    stackable: true,
    icon: faAirdropParachute,
  },
  ...CASHBACK_CATALOG,
] as const;

export function getFeaturedMarketItems(limit = 3): PointsMarketItem[] {
  const featured = POINTS_MARKET_CATALOG.filter((item) => item.featured);
  return (featured.length > 0 ? featured : [...POINTS_MARKET_CATALOG]).slice(0, limit);
}

export function isMarketItemStackable(item: PointsMarketItem): boolean {
  return item.stackable !== false;
}

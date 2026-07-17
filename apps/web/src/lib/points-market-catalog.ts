import type { PointsTierId } from "@/lib/points-levels";
import type { PumpIconDefinition } from "@/lib/icons";
import {
  faAirdropParachute,
  faCalendarMoney,
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
  | "cashback_25_weekly"
  | "cashback_60_monthly";

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

/** Three fee-cashback perks — one rate × one duration each (no 12-cell matrix). */
const CASHBACK_CATALOG: PointsMarketItem[] = [
  {
    id: "cashback_10_daily",
    title: "10% Daily cashback",
    description: "10% fees · 24h.",
    costPts: 300,
    unlockTier: "rookie",
    featured: true,
    stackable: true,
    comingSoon: true,
    icon: faPercent,
  },
  {
    id: "cashback_25_weekly",
    title: "25% Weekly cashback",
    description: "25% fees · 7 days.",
    costPts: 1_500,
    unlockTier: "trader",
    stackable: true,
    comingSoon: true,
    icon: faCoins,
  },
  {
    id: "cashback_60_monthly",
    title: "60% Monthly cashback",
    description: "60% fees · 30 days.",
    costPts: 6_000,
    unlockTier: "pro",
    stackable: true,
    comingSoon: true,
    icon: faCalendarMoney,
  },
];

/**
 * Perks catalog — redeem spends XP into `points_inventory`.
 * `comingSoon` items are display-only until effects ship.
 */
export const POINTS_MARKET_CATALOG: readonly PointsMarketItem[] = [
  {
    id: "status_badge",
    title: "Profile badge",
    description: "Badge next to your name.",
    costPts: 500,
    unlockTier: "rookie",
    featured: true,
    stackable: false,
    icon: faStarRegular,
  },
  {
    id: "launch_boost",
    title: "Launch spotlight",
    description: "Pin a launch in Arena 24h.",
    costPts: 2_500,
    unlockTier: "trader",
    featured: true,
    stackable: true,
    icon: faRocket,
  },
  {
    id: "airdrop_weight",
    title: "Airdrop multiplier",
    description: "1.5× score on one campaign.",
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

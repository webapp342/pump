import type { PointsTierId } from "@/lib/points-levels";
import type { PumpIconDefinition } from "@/lib/icons";
import {
  faAirdropParachute,
  faBolt,
  faRocket,
  faShieldHalved,
  faStarRegular,
} from "@/lib/pump-icons";

export type PointsMarketItemId =
  | "trade_fee_credit"
  | "launch_boost"
  | "airdrop_weight"
  | "season_pass"
  | "status_badge";

export type PointsMarketItem = {
  id: PointsMarketItemId;
  title: string;
  description: string;
  /** Points cost to redeem (Faz 2). */
  costPts: number;
  /** Minimum tier id required to unlock. */
  unlockTier: PointsTierId;
  featured?: boolean;
  icon: PumpIconDefinition;
};

/** Static V1 Market catalog — redeem disabled in UI. */
export const POINTS_MARKET_CATALOG: readonly PointsMarketItem[] = [
  {
    id: "trade_fee_credit",
    title: "Trade fee credit",
    description: "Time-boxed trading fee discount on Pump swaps.",
    costPts: 250,
    unlockTier: "rookie",
    featured: true,
    icon: faBolt,
  },
  {
    id: "launch_boost",
    title: "Launch boost",
    description: "Featured listing credit when you create a token.",
    costPts: 800,
    unlockTier: "trader",
    featured: true,
    icon: faRocket,
  },
  {
    id: "airdrop_weight",
    title: "Airdrop weight boost",
    description: "Extra qualification weight on one eligible campaign.",
    costPts: 1_200,
    unlockTier: "pro",
    featured: true,
    icon: faAirdropParachute,
  },
  {
    id: "season_pass",
    title: "Season pass",
    description: "Early access to upcoming seasonal activities and drops.",
    costPts: 2_500,
    unlockTier: "elite",
    icon: faShieldHalved,
  },
  {
    id: "status_badge",
    title: "Status badge",
    description: "Profile badge that shows your loyalty standing.",
    costPts: 150,
    unlockTier: "rookie",
    icon: faStarRegular,
  },
] as const;

export function getFeaturedMarketItems(limit = 3): PointsMarketItem[] {
  const featured = POINTS_MARKET_CATALOG.filter((item) => item.featured);
  return (featured.length > 0 ? featured : [...POINTS_MARKET_CATALOG]).slice(0, limit);
}

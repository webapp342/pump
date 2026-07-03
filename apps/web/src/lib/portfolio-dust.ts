import { bnbToUsd } from "@/lib/format-usd";
import { PORTFOLIO_DUST_MIN_VALUE_USD } from "@/lib/portfolio-limits";

/** True when USD value is known and below the dust floor. Unknown price → not dust. */
export function isPortfolioDustHolding(
  estimatedValueBnb: number,
  bnbUsd: number | null | undefined,
  minUsd = PORTFOLIO_DUST_MIN_VALUE_USD
): boolean {
  const usd = bnbToUsd(estimatedValueBnb, bnbUsd);
  if (usd == null) return false;
  return usd < minUsd;
}

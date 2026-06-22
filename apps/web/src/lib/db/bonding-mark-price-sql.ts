import {
  BONDING_TOKEN_SUPPLY_HUMAN,
  BONDING_VIRTUAL_BNB_HUMAN,
} from "@/lib/bonding-curve";

/** Marginal spot BNB/token from bonding_state reserves (matches token page + arena). */
export function sqlBondingMarkPrice(alias = "b"): string {
  return `
    CASE
      WHEN (${BONDING_TOKEN_SUPPLY_HUMAN}::numeric - COALESCE(${alias}.token_sold, 0)) > 0
      THEN (${BONDING_VIRTUAL_BNB_HUMAN}::numeric + COALESCE(${alias}.reserve_zug, 0))
           / (${BONDING_TOKEN_SUPPLY_HUMAN}::numeric - COALESCE(${alias}.token_sold, 0))
      ELSE COALESCE(${alias}.last_price_zug, 0)
    END
  `;
}

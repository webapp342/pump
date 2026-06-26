import {
  BONDING_TOKEN_SUPPLY_HUMAN,
  spotPriceBnbFromBondingDecimals,
} from "@/lib/bonding-curve";

export type BondingListMetricsRow = {
  reserve_zug: string;
  token_sold?: string | null;
  virtual_zug_reserve?: string | null;
  virtual_token_reserve?: string | null;
  market_cap_zug: string;
  ath_market_cap_zug: string;
};

/** Single source of truth for board MCAP — portfolio + arena share this. */
export function resolveBondingListMarketCapBnb(row: BondingListMetricsRow): string {
  const virtualZug =
    row.virtual_zug_reserve != null && row.virtual_zug_reserve !== ""
      ? Number(row.virtual_zug_reserve)
      : undefined;
  const virtualToken =
    row.virtual_token_reserve != null && row.virtual_token_reserve !== ""
      ? Number(row.virtual_token_reserve)
      : undefined;

  const spot = spotPriceBnbFromBondingDecimals(
    row.reserve_zug,
    row.token_sold ?? 0,
    virtualZug,
    virtualToken
  );

  if (spot > 0) {
    return String(spot * BONDING_TOKEN_SUPPLY_HUMAN);
  }

  const fallback = Number(row.market_cap_zug);
  return Number.isFinite(fallback) && fallback > 0 ? row.market_cap_zug : "0";
}

export function resolveBondingListAthMarketCapBnb(
  marketCapBnb: string,
  sqlAthMarketCapBnb: string
): string {
  const mcap = Number(marketCapBnb);
  const ath = Number(sqlAthMarketCapBnb);
  if (Number.isFinite(mcap) && Number.isFinite(ath) && ath > 0) {
    return String(Math.max(mcap, ath));
  }
  if (Number.isFinite(ath) && ath > 0) return sqlAthMarketCapBnb;
  return marketCapBnb;
}

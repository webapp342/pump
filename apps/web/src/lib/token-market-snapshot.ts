import { DEFAULT_TOKEN_TOTAL_SUPPLY } from "@/lib/format-usd";
import type { TokenDetail, TokenListItem } from "@/lib/db/launchpad";

/**
 * Canonical token market view — spot + FDV from indexer/DB bonding math.
 * UI header, chart pin, sidebar active row, and callouts read this only.
 * Trade tape "Price" column stays execution fill (separate semantic).
 */
export type TokenMarketSnapshot = {
  spotPriceBnb: number;
  marketCapBnb: number;
  /** Optional — keeps token-page sidebar row in sync with header tape stats. */
  volume24hBnb?: number;
  tradeCount?: number;
};

export function buildTokenMarketSnapshot(
  token: Pick<TokenDetail, "lastPriceBnb" | "marketCapBnb">,
  options?: { pendingSpotAfterBnb?: number | null }
): TokenMarketSnapshot {
  const pending = options?.pendingSpotAfterBnb;
  const spotFromToken = Number(token.lastPriceBnb);
  const mcapFromToken = Number(token.marketCapBnb);

  let spot =
    pending != null && pending > 0
      ? pending
      : Number.isFinite(spotFromToken) && spotFromToken > 0
        ? spotFromToken
        : 0;

  let mcap =
    spot > 0
      ? spot * DEFAULT_TOKEN_TOTAL_SUPPLY
      : Number.isFinite(mcapFromToken) && mcapFromToken > 0
        ? mcapFromToken
        : 0;

  if (spot <= 0 && mcap > 0) {
    spot = mcap / DEFAULT_TOKEN_TOTAL_SUPPLY;
  }

  return { spotPriceBnb: spot, marketCapBnb: mcap };
}

/** Patch arena/sidebar row for the token page active coin. */
export function applyActiveMarketToListItem(
  token: TokenListItem,
  snapshot: TokenMarketSnapshot
): TokenListItem {
  return {
    ...token,
    marketCapBnb: String(snapshot.marketCapBnb),
    ...(snapshot.volume24hBnb != null && Number.isFinite(snapshot.volume24hBnb)
      ? { volume24hBnb: String(snapshot.volume24hBnb) }
      : {}),
    ...(snapshot.tradeCount != null && snapshot.tradeCount > 0
      ? { tradeCount: snapshot.tradeCount }
      : {}),
  };
}

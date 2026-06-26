import {
  BONDING_TOKEN_SUPPLY_HUMAN,
  spotPriceBnbFromBondingDecimals,
} from "@/lib/bonding-curve";
import type { TokenListItem } from "@/lib/db/launchpad";

export type ArenaTradeWsPayload = {
  type?: string;
  tokenAddress?: string;
  bonding?: {
    reserveZug?: string;
    tokenSold?: string;
    marketCapZug?: string;
    lastPriceZug?: string;
    spotPriceZug?: string;
    progressBps?: number;
    tradeCount?: number;
    holderCount?: number;
    volume24hZug?: string;
    traders24h?: number;
  };
};

const MCAP_JUMP_REJECT_RATIO = 4;

function bondingFieldPresent(value: string | undefined): boolean {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

/** Marginal spot BNB/token from WS bonding fields (human DB decimals). */
export function arenaWsSpotPriceBnb(
  bonding: NonNullable<ArenaTradeWsPayload["bonding"]>
): number {
  if (bondingFieldPresent(bonding.reserveZug) && bondingFieldPresent(bonding.tokenSold)) {
    return spotPriceBnbFromBondingDecimals(bonding.reserveZug, bonding.tokenSold);
  }

  const lastSpot = Number(bonding.lastPriceZug);
  if (Number.isFinite(lastSpot) && lastSpot > 0 && lastSpot < 1) {
    return lastSpot;
  }

  const mcap = Number(bonding.marketCapZug);
  if (Number.isFinite(mcap) && mcap > 0) {
    return mcap / BONDING_TOKEN_SUPPLY_HUMAN;
  }

  return 0;
}

/**
 * Same mark-cap as API SQL / portfolio launched tokens.
 * Prefer indexer-published marketCapZug (DB bonding_states) over client reserve replay —
 * replay uses default virtual reserves and can understate MCAP vs SQL.
 */
export function bondingMarkCapBnbFromWs(
  bonding: NonNullable<ArenaTradeWsPayload["bonding"]>,
  previousMarketCapBnb?: string | number | null
): string | null {
  const prev = Number(previousMarketCapBnb);

  const mcapCol = Number(bonding.marketCapZug);
  if (Number.isFinite(mcapCol) && mcapCol > 0) {
    if (isMcapJumpSane(prev, mcapCol)) return String(mcapCol);
  }

  const spotPublished = Number(bonding.spotPriceZug ?? bonding.lastPriceZug);
  if (Number.isFinite(spotPublished) && spotPublished > 0) {
    const mcap = spotPublished * BONDING_TOKEN_SUPPLY_HUMAN;
    if (isMcapJumpSane(prev, mcap)) return String(mcap);
  }

  const spot = arenaWsSpotPriceBnb(bonding);
  if (spot > 0) {
    const mcap = spot * BONDING_TOKEN_SUPPLY_HUMAN;
    if (isMcapJumpSane(prev, mcap)) return String(mcap);
    if (!Number.isFinite(prev) || prev <= 0) return String(mcap);
  }

  if (Number.isFinite(mcapCol) && mcapCol > 0 && isMcapJumpSane(prev, mcapCol)) {
    return String(mcapCol);
  }

  return null;
}

function isMcapJumpSane(previous: number, next: number): boolean {
  if (!Number.isFinite(previous) || previous <= 0) return true;
  if (!Number.isFinite(next) || next <= 0) return false;
  const ratio = next / previous;
  return ratio <= MCAP_JUMP_REJECT_RATIO && ratio >= 1 / MCAP_JUMP_REJECT_RATIO;
}

/** Apply indexer WS trade payload to a board row without full refetch. */
export function patchTokenFromArenaTrade(
  token: TokenListItem,
  payload: ArenaTradeWsPayload
): TokenListItem | null {
  const addr = payload.tokenAddress?.toLowerCase();
  if (!addr || token.address.toLowerCase() !== addr) return null;

  const bonding = payload.bonding;
  if (!bonding) return null;

  const nextMcap =
    bondingMarkCapBnbFromWs(bonding, token.marketCapBnb) ?? token.marketCapBnb;

  const nextMcapNum = Number(nextMcap);
  const prevAth = Number(token.athMarketCapBnb ?? token.marketCapBnb ?? 0);
  const nextAth =
    Number.isFinite(nextMcapNum) && nextMcapNum > 0 && nextMcapNum > prevAth
      ? String(nextMcapNum)
      : token.athMarketCapBnb;

  return {
    ...token,
    progressBps: bonding.progressBps ?? token.progressBps,
    reserveBnb: bonding.reserveZug ?? token.reserveBnb,
    marketCapBnb: nextMcap,
    athMarketCapBnb: nextAth,
    tradeCount: bonding.tradeCount ?? token.tradeCount,
    holderCount: bonding.holderCount ?? token.holderCount,
    volume24hBnb: bonding.volume24hZug ?? token.volume24hBnb,
    traders24h: bonding.traders24h ?? token.traders24h,
  };
}

export function patchArenaTokenList(
  tokens: TokenListItem[],
  payload: ArenaTradeWsPayload
): { next: TokenListItem[]; changed: boolean } {
  if (payload.type !== "trade" || !payload.tokenAddress) {
    return { next: tokens, changed: false };
  }

  let changed = false;
  const next = tokens.map((token) => {
    const patched = patchTokenFromArenaTrade(token, payload);
    if (!patched) return token;
    changed = true;
    return patched;
  });

  return { next, changed };
}

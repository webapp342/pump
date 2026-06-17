import type { TokenListItem } from "@/lib/db/launchpad";

export type ArenaTradeWsPayload = {
  type?: string;
  tokenAddress?: string;
  bonding?: {
    reserveZug?: string;
    marketCapZug?: string;
    lastPriceZug?: string;
    progressBps?: number;
    tradeCount?: number;
    holderCount?: number;
  };
};

/** Apply indexer WS trade payload to a board row without full refetch. */
export function patchTokenFromArenaTrade(
  token: TokenListItem,
  payload: ArenaTradeWsPayload
): TokenListItem | null {
  const addr = payload.tokenAddress?.toLowerCase();
  if (!addr || token.address.toLowerCase() !== addr) return null;

  const bonding = payload.bonding;
  if (!bonding) return null;

  return {
    ...token,
    progressBps: bonding.progressBps ?? token.progressBps,
    reserveBnb: bonding.reserveZug ?? token.reserveBnb,
    marketCapBnb: bonding.marketCapZug ?? token.marketCapBnb,
    tradeCount: bonding.tradeCount ?? token.tradeCount,
    holderCount: bonding.holderCount ?? token.holderCount,
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

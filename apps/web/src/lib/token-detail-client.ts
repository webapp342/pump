import type { TokenDetail, TokenListItem } from "@/lib/db/launchpad";
import type { TokenDetailBundle } from "@/lib/token-server";
import { normalizeRouteAddressKey } from "@/lib/address";
import { EMPTY_SOCIAL_LINKS } from "@/lib/token-social";
import { buildTokenMarketSnapshot } from "@/lib/token-market-snapshot";

/** Session cache — instant re-visits & sidebar switches (Arena board cache pattern). */
export const tokenDetailBundleCache = new Map<string, TokenDetailBundle>();

export function tokenDetailQueryKey(address: string) {
  return ["token-detail", normalizeRouteAddressKey(address)] as const;
}

export async function fetchTokenDetailBundleClient(
  address: string
): Promise<TokenDetailBundle | null> {
  const normalized = normalizeRouteAddressKey(address);
  try {
    const response = await fetch(`/api/tokens/${encodeURIComponent(normalized)}`, {
      cache: "no-store",
    });
    const body = (await response.json()) as {
      data?: TokenDetailBundle;
      error?: string;
    };

    if (!response.ok || !body.data) return null;

    tokenDetailBundleCache.set(normalized, body.data);
    return body.data;
  } catch {
    return null;
  }
}

export function peekTokenDetailBundle(address: string): TokenDetailBundle | undefined {
  return tokenDetailBundleCache.get(normalizeRouteAddressKey(address));
}

export function seedTokenDetailBundle(address: string, bundle: TokenDetailBundle) {
  tokenDetailBundleCache.set(normalizeRouteAddressKey(address), bundle);
}

/** Instant toolbar / header on sidebar click before full bundle fetch lands. */
export function seedTokenDetailFromListItem(token: TokenListItem) {
  const detail: TokenDetail = {
    ...token,
    description: null,
    socialLinks: EMPTY_SOCIAL_LINKS,
    launchTxHash: "",
    creatorFollowerCount: 0,
    targetBnb: "0",
    tokenSold: "0",
    tradeCount: token.tradeCount ?? 0,
    lastPriceBnb: "0",
  };

  seedTokenDetailBundle(token.address, {
    token: detail,
    trades: [],
    holders: [],
    market: buildTokenMarketSnapshot(detail),
  });
}

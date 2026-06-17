import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import { getTokenByAddress, listTradesForToken } from "@/lib/db/launchpad";
import { normalizeAddressParam } from "@/lib/address";

export type TokenDetailPayload = {
  token: TokenDetail;
  trades: TradeItem[];
};

/** Server-side token page payload — SSR + shared with /api/tokens/[address]. */
export async function fetchTokenDetailPayload(
  addressParam: string
): Promise<TokenDetailPayload | null> {
  const normalized = normalizeAddressParam(addressParam);
  if (!normalized) return null;

  const [token, trades] = await Promise.all([
    getTokenByAddress(normalized),
    listTradesForToken(normalized, 100),
  ]);

  if (!token) return null;
  return { token, trades };
}

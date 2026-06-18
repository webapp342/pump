import { cacheLife, cacheTag } from "next/cache";
import type { TokenDetail, TokenHolderSnapshot, TradeItem } from "@/lib/db/launchpad";
import { getTokenByAddress, listTokenHolders, listTradesForToken } from "@/lib/db/launchpad";
import { normalizeAddressParam } from "@/lib/address";
import {
  readTokenSnapshotCache,
  writeTokenSnapshotCache,
} from "@/lib/redis/token-cache";
import { useRedisArenaCache } from "@/lib/db/perf-flags";

export type TokenDetailPayload = {
  token: TokenDetail;
  trades: TradeItem[];
};

export type TokenDetailBundle = TokenDetailPayload & {
  holders: TokenHolderSnapshot[];
};

async function fetchTokenDetailBundleCached(
  normalized: string
): Promise<TokenDetailBundle | null> {
  "use cache";
  cacheTag(`token:${normalized}`);
  cacheLife({ stale: 5, revalidate: 5, expire: 30 });

  if (useRedisArenaCache()) {
    const cached = await readTokenSnapshotCache(normalized);
    if (cached) {
      return {
        token: cached.token,
        trades: cached.trades,
        holders: cached.holders ?? [],
      };
    }
  }

  const [token, trades, holders] = await Promise.all([
    getTokenByAddress(normalized),
    listTradesForToken(normalized, 100),
    listTokenHolders(normalized, 300),
  ]);

  if (!token) return null;

  const bundle: TokenDetailBundle = { token, trades, holders };

  if (useRedisArenaCache()) {
    await writeTokenSnapshotCache(normalized, bundle);
  }

  return bundle;
}

/** Server-side token page bundle — SSR + shared with /api/tokens/[address]. */
export async function fetchTokenDetailBundle(
  addressParam: string
): Promise<TokenDetailBundle | null> {
  const normalized = normalizeAddressParam(addressParam);
  if (!normalized) return null;
  return fetchTokenDetailBundleCached(normalized);
}

/** Legacy payload without holders — delegates to bundle. */
export async function fetchTokenDetailPayload(
  addressParam: string
): Promise<TokenDetailPayload | null> {
  const bundle = await fetchTokenDetailBundle(addressParam);
  if (!bundle) return null;
  return { token: bundle.token, trades: bundle.trades };
}

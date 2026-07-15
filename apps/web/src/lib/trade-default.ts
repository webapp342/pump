import { getTopTokenAddressByMcap } from "@/lib/db/launchpad";
import { useRedisArenaCache } from "@/lib/db/perf-flags";
import {
  readDefaultTradeTokenCache,
  readTopMcapCache,
} from "@/lib/redis/arena-cache";

/** Arena/indexer write top:mcap:20 — always read that list and take [0]. */
const TOP_MCAP_CACHE_LIMIT = 20;

/** Highest market-cap token — fallback when no last-visited token is saved locally. */
export async function resolveDefaultTradeTokenAddress(): Promise<string | null> {
  if (useRedisArenaCache()) {
    const sticky = await readDefaultTradeTokenCache();
    if (sticky) return sticky;

    const cached = await readTopMcapCache(TOP_MCAP_CACHE_LIMIT);
    const fromCache = cached?.[0]?.address;
    if (fromCache) return fromCache;
  }

  return getTopTokenAddressByMcap();
}

export async function resolveDefaultTradeHref(): Promise<string> {
  const address = await resolveDefaultTradeTokenAddress();
  if (!address) return "/";
  return `/token/${address}?trade=buy`;
}

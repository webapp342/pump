import { listTopTokensByMcap } from "@/lib/db/launchpad";
import { useRedisArenaCache } from "@/lib/db/perf-flags";
import { readTopMcapCache } from "@/lib/redis/arena-cache";

const TOP_MCAP_LIMIT = 1;

/** Highest market-cap token — fallback when no last-visited token is saved locally. */
export async function resolveDefaultTradeTokenAddress(): Promise<string | null> {
  if (useRedisArenaCache()) {
    const cached = await readTopMcapCache(TOP_MCAP_LIMIT);
    const fromCache = cached?.[0]?.address;
    if (fromCache) return fromCache;
  }

  const rows = await listTopTokensByMcap(TOP_MCAP_LIMIT);
  return rows[0]?.address ?? null;
}

export async function resolveDefaultTradeHref(): Promise<string> {
  const address = await resolveDefaultTradeTokenAddress();
  if (!address) return "/";
  return `/token/${address}?trade=buy`;
}

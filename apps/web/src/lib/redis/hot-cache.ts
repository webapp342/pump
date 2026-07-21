import type { CandleInterval, CandleWsUpdate } from "@/lib/candles";
import { normalizeRouteAddressKey } from "@/lib/address";
import { getRedisClient, readCacheJson } from "@/lib/redis/client";

/** Matches indexer-sol redis-hot-cache.ts key shape. */
export function buildHotCandleKey(tokenAddress: string, interval: CandleInterval): string {
  return `pump:hot:candle:${normalizeRouteAddressKey(tokenAddress)}:${interval}`;
}

export async function readHotCandleUpdate(
  tokenAddress: string,
  interval: CandleInterval
): Promise<CandleWsUpdate | null> {
  return readCacheJson<CandleWsUpdate>(buildHotCandleKey(tokenAddress, interval));
}

export type HotTapeEntry = {
  id: string;
  side: string;
  traderAddress: string;
  zugAmount: string;
  tokenAmount: string;
  priceZug: string;
  txHash: string;
  blockTime: string;
};

export function buildHotTapeKey(tokenAddress: string): string {
  return `pump:hot:tape:${normalizeRouteAddressKey(tokenAddress)}`;
}

/** Recent trades ring buffer from indexer (newest first in Redis LIST). */
export async function readHotTapeEntries(
  tokenAddress: string,
  limit = 50
): Promise<HotTapeEntry[]> {
  const client = getRedisClient();
  if (!client) return [];

  try {
    if (client.status !== "ready") await client.connect();
    const raw = await client.lrange(buildHotTapeKey(tokenAddress), 0, limit - 1);
    const out: HotTapeEntry[] = [];
    for (const line of raw) {
      try {
        out.push(JSON.parse(line) as HotTapeEntry);
      } catch {
        // skip
      }
    }
    return out;
  } catch {
    return [];
  }
}

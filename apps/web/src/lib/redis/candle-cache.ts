import type { CandleBar, CandleInterval, VolumeBar } from "@/lib/candles";
import { readCacheJson, writeCacheJson } from "@/lib/redis/client";

const CANDLE_CACHE_TTL_SEC = 5;

export type CachedCandlePayload = {
  candles: CandleBar[];
  volumes: VolumeBar[];
  interval: CandleInterval;
  source: "db" | "trades";
  gapFilled: boolean;
  gapFill: "sql" | "ts";
  cachedAt: number;
};

export function buildCandleCacheKey(tokenAddress: string, interval: string): string {
  return `pump:cache:candles:${tokenAddress.toLowerCase()}:${interval}`;
}

export async function readCandleCache(
  tokenAddress: string,
  interval: string
): Promise<CachedCandlePayload | null> {
  return readCacheJson<CachedCandlePayload>(buildCandleCacheKey(tokenAddress, interval));
}

export async function writeCandleCache(
  tokenAddress: string,
  interval: string,
  payload: Omit<CachedCandlePayload, "cachedAt">
): Promise<void> {
  await writeCacheJson(
    buildCandleCacheKey(tokenAddress, interval),
    { ...payload, cachedAt: Date.now() },
    CANDLE_CACHE_TTL_SEC
  );
}

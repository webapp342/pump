import { Redis } from "ioredis";
import { REDIS_KEYS } from "@pump/xp";
import { redisUrl } from "@/lib/db/perf-flags";

export type RedisNativePrice = {
  nativeUsd: number;
  source: string;
  symbol: string;
  fetchedAt: string;
};

export async function readRedisNativePrice(): Promise<RedisNativePrice | null> {
  const url = redisUrl();
  if (!url) return null;

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  try {
    if (client.status !== "ready") await client.connect();
    const raw = await client.get(REDIS_KEYS.nativePriceSolUsd);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RedisNativePrice;
    if (!parsed?.nativeUsd || parsed.nativeUsd <= 0) return null;
    return parsed;
  } catch {
    return null;
  } finally {
    await client.quit().catch(() => undefined);
  }
}

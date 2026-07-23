import { Redis } from "ioredis";
import { redisUrl } from "@/lib/db/perf-flags";

let redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  const url = redisUrl();
  if (!url) return null;

  if (!redis) {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", () => {
      // Fail open — fall back to PostgreSQL.
    });
  }

  return redis;
}

export async function readCacheJson<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    if (client.status !== "ready") await client.connect();
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCacheJson(
  key: string,
  payload: unknown,
  ttlSeconds: number
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    if (client.status !== "ready") await client.connect();
    await client.set(key, JSON.stringify(payload), "EX", ttlSeconds);
  } catch {
    // Ignore cache write failures.
  }
}

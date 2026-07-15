import { Redis } from "ioredis";

let redis: Redis | null = null;

function redisCacheEnabled(): boolean {
  return (
    process.env.REDIS_CACHE_ENABLED !== "false" &&
    Boolean(process.env.REDIS_URL?.trim()) &&
    (process.env.REDIS_PUBLISH_ENABLED === "true" ||
      process.env.REDIS_CACHE_ENABLED === "true")
  );
}

function getRedis(): Redis | null {
  if (!redisCacheEnabled()) return null;

  if (!redis) {
    redis = new Redis(process.env.REDIS_URL!.trim(), {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", (error: Error) => {
      console.warn("redis cache error:", error.message);
    });
  }

  return redis;
}

const HOT_ARENA_CACHE_KEYS = [
  "pump:cache:arena:new:age:desc:50",
  "pump:cache:arena:all:mcap:desc:50",
  "pump:cache:arena:all:age:desc:50",
  "pump:cache:top:mcap:20",
  "pump:cache:default-trade-token",
  "pump:cache:filter:counts",
] as const;

export function arenaCacheKey(parts: {
  filter: string;
  sortKey: string;
  sortDir: string;
  limit: number;
  airdropKey?: string;
}): string {
  const airdrop = parts.airdropKey ? `:${parts.airdropKey}` : "";
  return `pump:cache:arena:${parts.filter}:${parts.sortKey}:${parts.sortDir}:${parts.limit}${airdrop}`;
}

export function topMcapCacheKey(limit: number): string {
  return `pump:cache:top:mcap:${limit}`;
}

export function tokenSnapshotCacheKey(tokenAddress: string): string {
  return `pump:cache:token:${tokenAddress.toLowerCase()}`;
}

export async function setCacheJson(
  key: string,
  payload: unknown,
  ttlSeconds: number
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    if (client.status !== "ready") await client.connect();
    await client.set(key, JSON.stringify(payload), "EX", ttlSeconds);
  } catch (error) {
    console.warn(
      "redis set cache failed:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function invalidateArenaCaches(tokenAddress?: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    if (client.status !== "ready") await client.connect();
    const keys: string[] = [...HOT_ARENA_CACHE_KEYS];
    if (tokenAddress) {
      keys.push(tokenSnapshotCacheKey(tokenAddress));
    }
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    console.warn(
      "redis invalidate cache failed:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function closeRedisCache(): Promise<void> {
  if (!redis) return;
  await redis.quit();
  redis = null;
}

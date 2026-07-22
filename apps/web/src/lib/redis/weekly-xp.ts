import "server-only";

import { Redis } from "ioredis";
import { CASHBACK_XP_THRESHOLD, REDIS_KEYS, parseSeasonMeta } from "@pump/xp";
import { redisUrl, useRedisWeeklyXp } from "@/lib/db/perf-flags";

let redis: Redis | null = null;

function getClient(): Redis | null {
  if (!useRedisWeeklyXp()) return null;
  const url = redisUrl();
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  }
  return redis;
}

export async function getWeeklyUserXp(walletAddress: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  try {
    if (client.status !== "ready") await client.connect();
    const score = await client.zscore(REDIS_KEYS.weeklyUserXp, walletAddress);
    if (score == null) return 0;
    const n = Number(score);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export async function getWeeklyLeaderboard(limit: number): Promise<
  Array<{ walletAddress: string; weeklyXp: number; rank: number }>
> {
  const client = getClient();
  if (!client) return [];
  const capped = Math.min(Math.max(limit, 1), 500);
  try {
    if (client.status !== "ready") await client.connect();
    const rows = await client.zrevrange(
      REDIS_KEYS.weeklyUserXp,
      0,
      capped - 1,
      "WITHSCORES"
    );
    const out: Array<{ walletAddress: string; weeklyXp: number; rank: number }> = [];
    for (let i = 0; i < rows.length; i += 2) {
      out.push({
        walletAddress: rows[i]!,
        weeklyXp: Math.floor(Number(rows[i + 1] ?? 0)),
        rank: out.length + 1,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function getWeeklyClanLeaderboard(limit: number): Promise<
  Array<{ clanId: string; weeklyXp: number; rank: number }>
> {
  const client = getClient();
  if (!client) return [];
  const capped = Math.min(Math.max(limit, 1), 100);
  try {
    if (client.status !== "ready") await client.connect();
    const rows = await client.zrevrange(
      REDIS_KEYS.weeklyClanXp,
      0,
      capped - 1,
      "WITHSCORES"
    );
    const out: Array<{ clanId: string; weeklyXp: number; rank: number }> = [];
    for (let i = 0; i < rows.length; i += 2) {
      out.push({
        clanId: rows[i]!,
        weeklyXp: Math.floor(Number(rows[i + 1] ?? 0)),
        rank: out.length + 1,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function getSeasonMeta() {
  const client = getClient();
  if (!client) return parseSeasonMeta(null);
  try {
    if (client.status !== "ready") await client.connect();
    const raw = await client.hgetall(REDIS_KEYS.seasonCurrent);
    return parseSeasonMeta(Object.keys(raw).length ? raw : null);
  } catch {
    return parseSeasonMeta(null);
  }
}

export { CASHBACK_XP_THRESHOLD };

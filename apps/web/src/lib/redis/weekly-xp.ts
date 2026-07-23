import "server-only";

import { Redis } from "ioredis";
import { CASHBACK_XP_THRESHOLD, REDIS_KEYS, parseSeasonMeta } from "@pump/xp";
import { getLaunchpadPool } from "@/lib/db/launchpad";
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

export async function lookupClanIdForWallet(walletAddress: string): Promise<string | null> {
  try {
    const pool = getLaunchpadPool();
    const res = await pool.query<{ clan_id: string }>(
      `SELECT clan_id::text FROM clan_members WHERE wallet_address = $1 LIMIT 1`,
      [walletAddress]
    );
    return res.rows[0]?.clan_id ?? null;
  } catch {
    return null;
  }
}

/** Missions Tür A — mirror indexer awardWeeklyXpMission (F1). */
export async function awardWeeklyXpMission(
  walletAddress: string,
  xp: number,
  clanId?: string | null
): Promise<void> {
  if (xp <= 0) return;
  const client = getClient();
  if (!client) return;

  try {
    if (client.status !== "ready") await client.connect();
    await client.zincrby(REDIS_KEYS.weeklyUserXp, xp, walletAddress);
    if (clanId) {
      await client.zincrby(REDIS_KEYS.weeklyClanXp, xp, clanId);
    }
  } catch {
    // Fire-and-forget — PG mission award already succeeded.
  }
}

/** After launchpad_award_points — sync weekly ZSET (non-blocking). */
export function syncWeeklyXpAfterMissionAward(
  walletAddress: string,
  pointsAwarded: number
): void {
  if (pointsAwarded <= 0 || !useRedisWeeklyXp()) return;
  void (async () => {
    const clanId = await lookupClanIdForWallet(walletAddress);
    await awardWeeklyXpMission(walletAddress, pointsAwarded, clanId);
  })();
}

export { CASHBACK_XP_THRESHOLD };

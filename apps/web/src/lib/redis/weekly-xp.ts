import "server-only";

import { Redis } from "ioredis";
import { CASHBACK_XP_THRESHOLD, REDIS_KEYS, parseSeasonMeta } from "@pump/xp";
import { getLaunchpadPool } from "@/lib/db/launchpad";
import { redisUrl, useRedisWeeklyXp } from "@/lib/db/perf-flags";

let redis: Redis | null = null;
let connectPromise: Promise<void> | null = null;

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
    redis.on("error", () => {
      // Fail open — caller returns empty/zero.
    });
  }
  return redis;
}

/** Dedupe concurrent connect() from Promise.all (leaderboard route). */
async function ensureWeeklyXpRedisReady(client: Redis): Promise<void> {
  if (client.status === "ready") return;
  if (!connectPromise) {
    connectPromise = client.connect().finally(() => {
      connectPromise = null;
    });
  }
  await connectPromise;
}

function parseLeaderboardLimit(limit: number): number {
  const n = Number.isFinite(limit) ? limit : 100;
  return Math.min(Math.max(Math.floor(n), 1), 500);
}

async function readWeeklyXpZrevrange(
  client: Redis,
  key: string,
  limit: number
): Promise<Array<{ id: string; weeklyXp: number }>> {
  const capped = parseLeaderboardLimit(limit);
  const stop = capped - 1;

  // Flat array — same as settlement-worker / ioredis docs.
  const rows = await client.zrevrange(key, 0, stop, "WITHSCORES");
  const out: Array<{ id: string; weeklyXp: number }> = [];
  for (let i = 0; i < rows.length; i += 2) {
    const id = rows[i];
    if (!id) continue;
    out.push({
      id,
      weeklyXp: Math.floor(Number(rows[i + 1] ?? 0)),
    });
  }
  return out;
}

export async function getWeeklyUserXp(walletAddress: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  try {
    await ensureWeeklyXpRedisReady(client);
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
  try {
    await ensureWeeklyXpRedisReady(client);
    const rows = await readWeeklyXpZrevrange(client, REDIS_KEYS.weeklyUserXp, limit);
    return rows.map((row, index) => ({
      walletAddress: row.id,
      weeklyXp: row.weeklyXp,
      rank: index + 1,
    }));
  } catch {
    return [];
  }
}

export async function getWeeklyClanLeaderboard(limit: number): Promise<
  Array<{ clanId: string; weeklyXp: number; rank: number }>
> {
  const client = getClient();
  if (!client) return [];
  try {
    await ensureWeeklyXpRedisReady(client);
    const rows = await readWeeklyXpZrevrange(client, REDIS_KEYS.weeklyClanXp, limit);
    return rows.map((row, index) => ({
      clanId: row.id,
      weeklyXp: row.weeklyXp,
      rank: index + 1,
    }));
  } catch {
    return [];
  }
}

export async function getSeasonMeta() {
  const client = getClient();
  if (!client) return parseSeasonMeta(null);
  try {
    await ensureWeeklyXpRedisReady(client);
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
    await ensureWeeklyXpRedisReady(client);
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

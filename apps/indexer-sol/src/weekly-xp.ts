import { Redis } from "ioredis";
import { computeTradeXp, REDIS_KEYS } from "@pump/xp";

let redis: Redis | null = null;

export function weeklyXpEnabled(): boolean {
  if (process.env.USE_REDIS_WEEKLY_XP === "false") return false;
  if (process.env.USE_REDIS_WEEKLY_XP === "true") return true;
  return Boolean(process.env.REDIS_URL?.trim());
}

function getRedis(): Redis | null {
  if (!weeklyXpEnabled()) return null;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  if (!redis) {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", (err: Error) => {
      console.warn("[indexer-sol] weekly-xp redis:", err.message);
    });
  }
  return redis;
}

export async function lookupClanId(
  pool: import("pg").Pool,
  walletAddress: string
): Promise<string | null> {
  try {
    const res = await pool.query<{ clan_id: string }>(
      `SELECT clan_id::text FROM clan_members WHERE wallet_address = $1 LIMIT 1`,
      [walletAddress]
    );
    return res.rows[0]?.clan_id ?? null;
  } catch {
    return null;
  }
}

export type AwardWeeklyXpInput = {
  walletAddress: string;
  volumeSolNet: number;
  clanId?: string | null;
};

/** Fire-and-forget — never throws into trade path. */
export function awardWeeklyXp(input: AwardWeeklyXpInput): void {
  const xp = computeTradeXp(input.volumeSolNet);
  if (xp <= 0) return;

  const client = getRedis();
  if (!client) return;

  void (async () => {
    try {
      if (client.status !== "ready") await client.connect();
      await client.zincrby(REDIS_KEYS.weeklyUserXp, xp, input.walletAddress);
      if (input.clanId) {
        await client.zincrby(REDIS_KEYS.weeklyClanXp, xp, input.clanId);
      }
    } catch (err) {
      console.warn(
        "[indexer-sol] weekly-xp ZINCRBY failed",
        err instanceof Error ? err.message : err
      );
    }
  })();
}

export async function awardWeeklyXpMission(
  walletAddress: string,
  xp: number,
  clanId?: string | null
): Promise<void> {
  if (xp <= 0 || !weeklyXpEnabled()) return;
  const client = getRedis();
  if (!client) return;

  try {
    if (client.status !== "ready") await client.connect();
    await client.zincrby(REDIS_KEYS.weeklyUserXp, xp, walletAddress);
    if (clanId) {
      await client.zincrby(REDIS_KEYS.weeklyClanXp, xp, clanId);
    }
  } catch (err) {
    console.warn(
      "[indexer-sol] mission weekly-xp failed",
      err instanceof Error ? err.message : err
    );
  }
}

export async function closeWeeklyXpRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => undefined);
    redis = null;
  }
}

import "server-only";

import { Redis } from "ioredis";
import { REDIS_KEYS, parseSeasonMeta, type SeasonMeta } from "@pump/xp";
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

export type SeasonStatus = {
  currentSeason: SeasonMeta;
  settledSeasonId: number | null;
  claimsOpen: boolean;
};

export async function getSeasonStatus(): Promise<SeasonStatus> {
  const client = getClient();
  const fallback: SeasonStatus = {
    currentSeason: { id: 1, startedAt: new Date().toISOString() },
    settledSeasonId: null,
    claimsOpen: false,
  };
  if (!client) return fallback;

  try {
    if (client.status !== "ready") {
      await client.connect();
    }

    const metaRaw = await client.hgetall(REDIS_KEYS.seasonCurrent).catch(() => ({}));
    const current = parseSeasonMeta(metaRaw);
    const settledSeasonId = current.id > 1 ? current.id - 1 : null;

    let claimsOpen = false;
    if (settledSeasonId != null) {
      const flag = await client
        .get(REDIS_KEYS.seasonClaimsOpen(settledSeasonId))
        .catch(() => null);
      claimsOpen = flag === "true";
    }

    return {
      currentSeason: current,
      settledSeasonId,
      claimsOpen,
    };
  } catch {
    return fallback;
  }
}

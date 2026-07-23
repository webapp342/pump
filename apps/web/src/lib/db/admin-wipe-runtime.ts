import "server-only";

import { Redis } from "ioredis";
import { REDIS_KEYS } from "@pump/xp";
import { clickhouseCandlesEnabled } from "@/lib/clickhouse/client";
import { redisUrl } from "@/lib/db/perf-flags";

export type WipeRuntimePurgeResult = {
  redis?: {
    ok: boolean;
    keysDeleted: number;
    seasonReset: boolean;
    skipped?: string;
    error?: string;
  };
  clickhouse?: {
    ok: boolean;
    tablesTruncated: string[];
    skipped?: string;
    error?: string;
  };
};

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  }
  return redis;
}

async function deleteByPattern(client: Redis, pattern: string): Promise<number> {
  let deleted = 0;
  let cursor = "0";
  do {
    const [next, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 250);
    cursor = next;
    if (keys.length > 0) {
      deleted += await client.del(...keys);
    }
  } while (cursor !== "0");
  return deleted;
}

/** Purge user/runtime Redis keys. Keeps native price cache (F7). */
export async function purgeRedisRuntimeData(): Promise<
  NonNullable<WipeRuntimePurgeResult["redis"]>
> {
  const client = getRedis();
  if (!client) {
    return { ok: true, keysDeleted: 0, seasonReset: false, skipped: "REDIS_URL unset" };
  }

  try {
    if (client.status !== "ready") await client.connect();

    let keysDeleted = 0;

    const fixedKeys = [
      REDIS_KEYS.weeklyUserXp,
      REDIS_KEYS.weeklyClanXp,
      REDIS_KEYS.chTradesStream,
      REDIS_KEYS.chCandlesStream,
    ];
    keysDeleted += await client.del(...fixedKeys);

    const patterns = [
      "pump:hot:*",
      "pump:seq:trade:*",
      "pump:stream:*",
      "clan:member:*",
      "weekly_user_xp_season_*",
      "weekly_clan_xp_season_*",
      "season:*:claims_open",
    ];
    for (const pattern of patterns) {
      keysDeleted += await deleteByPattern(client, pattern);
    }

    const startedAt = new Date().toISOString();
    await client.hset(REDIS_KEYS.seasonCurrent, {
      id: "1",
      started_at: startedAt,
    });

    return { ok: true, keysDeleted, seasonReset: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Redis purge failed";
    return { ok: false, keysDeleted: 0, seasonReset: false, error: message };
  }
}

function clickhouseAuthHeader(): string | undefined {
  const user = process.env.CLICKHOUSE_USER ?? "default";
  const pass = process.env.CLICKHOUSE_PASSWORD ?? "";
  if (!pass && user === "default") return undefined;
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function clickhouseExec(sql: string): Promise<void> {
  const base = process.env.CLICKHOUSE_URL!.replace(/\/$/, "");
  const database = process.env.CLICKHOUSE_DATABASE ?? "pump";
  const url = `${base}/?database=${encodeURIComponent(database)}`;
  const headers: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8",
  };
  const auth = clickhouseAuthHeader();
  if (auth) headers.authorization = auth;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: sql,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ClickHouse ${res.status}: ${text.slice(0, 200)}`);
  }
}

/** Truncate OLAP trade/candle tables (positions stay in PG). */
export async function purgeClickHouseRuntimeData(): Promise<
  NonNullable<WipeRuntimePurgeResult["clickhouse"]>
> {
  if (!clickhouseCandlesEnabled()) {
    return { ok: true, tablesTruncated: [], skipped: "CLICKHOUSE not configured" };
  }

  const tables = [
    "candles_spot",
    "candles_1m",
    "candles_5m",
    "candles_15m",
    "candles_1h",
    "candles_4h",
    "trades_raw",
  ];

  try {
    for (const table of tables) {
      await clickhouseExec(`TRUNCATE TABLE IF EXISTS ${table}`);
    }
    return { ok: true, tablesTruncated: tables };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ClickHouse purge failed";
    return { ok: false, tablesTruncated: [], error: message };
  }
}

export async function purgeRuntimeStores(): Promise<WipeRuntimePurgeResult> {
  const [redisResult, clickhouseResult] = await Promise.all([
    purgeRedisRuntimeData(),
    purgeClickHouseRuntimeData(),
  ]);
  return { redis: redisResult, clickhouse: clickhouseResult };
}

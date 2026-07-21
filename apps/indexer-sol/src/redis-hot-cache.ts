/**
 * Redis hot cache — chart tail buckets + recent tape (no PG/CH read on first paint).
 */

import { Redis } from "ioredis";
import type { CandleWsUpdatePayload, TradePublishPayload } from "./redis-types.js";

const HOT_CANDLE_TTL_SEC = 600;
const HOT_TAPE_TTL_SEC = 300;
const HOT_TAPE_MAX = 50;

let redis: Redis | null = null;

function redisEnabled(): boolean {
  return process.env.REDIS_PUBLISH_ENABLED === "true" && Boolean(process.env.REDIS_URL?.trim());
}

function roomKey(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

function getRedis(): Redis | null {
  if (!redisEnabled()) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL!.trim(), {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", (error: Error) => {
      console.warn("[indexer-sol] redis hot-cache error:", error.message);
    });
  }
  return redis;
}

export function hotCandleKey(tokenAddress: string, interval: string): string {
  return `pump:hot:candle:${roomKey(tokenAddress)}:${interval}`;
}

export function hotTapeKey(tokenAddress: string): string {
  return `pump:hot:tape:${roomKey(tokenAddress)}`;
}

/** Latest OHLC bucket for merge when SKIP_PG_TOKEN_CANDLES=true. */
export async function readHotCandleUpdate(
  tokenAddress: string,
  interval: string
): Promise<CandleWsUpdatePayload | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    if (client.status !== "ready") await client.connect();
    const raw = await client.get(hotCandleKey(tokenAddress, interval));
    if (!raw) return null;
    return JSON.parse(raw) as CandleWsUpdatePayload;
  } catch {
    return null;
  }
}

/** Latest OHLC bucket per interval — used by web chart API for tail merge. */
export async function writeHotCandleUpdates(
  tokenAddress: string,
  updates: CandleWsUpdatePayload[]
): Promise<void> {
  const client = getRedis();
  if (!client || updates.length === 0) return;

  try {
    if (client.status !== "ready") await client.connect();
    const pipe = client.pipeline();
    for (const update of updates) {
      pipe.set(
        hotCandleKey(tokenAddress, update.interval),
        JSON.stringify(update),
        "EX",
        HOT_CANDLE_TTL_SEC
      );
    }
    await pipe.exec();
  } catch (error) {
    console.warn(
      "[indexer-sol] hot candle write failed:",
      error instanceof Error ? error.message : error
    );
  }
}

type TapeEntry = {
  id: string;
  side: string;
  traderAddress: string;
  zugAmount: string;
  feeZug?: string;
  tokenAmount: string;
  priceZug: string;
  txHash: string;
  blockTime: string;
};

/** Ring buffer of recent trades for instant tape SSR. */
export async function pushHotTapeTrade(
  tokenAddress: string,
  trade: TradePublishPayload["trade"]
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  const entry: TapeEntry = {
    id: trade.id,
    side: trade.side,
    traderAddress: trade.traderAddress,
    zugAmount: trade.zugAmount,
    feeZug: trade.feeZug,
    tokenAmount: trade.tokenAmount,
    priceZug: trade.priceZug,
    txHash: trade.txHash,
    blockTime: trade.blockTime,
  };

  try {
    if (client.status !== "ready") await client.connect();
    const key = hotTapeKey(tokenAddress);
    await client
      .multi()
      .lpush(key, JSON.stringify(entry))
      .ltrim(key, 0, HOT_TAPE_MAX - 1)
      .expire(key, HOT_TAPE_TTL_SEC)
      .exec();
  } catch (error) {
    console.warn(
      "[indexer-sol] hot tape write failed:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function closeRedisHotCache(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => undefined);
    redis = null;
  }
}

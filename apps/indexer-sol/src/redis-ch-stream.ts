import { Redis } from "ioredis";
import type { TradeChRow } from "./clickhouse.js";

const GROUP = "ch-flusher";
const CONSUMER = `flusher-${process.pid}`;

let redis: Redis | null = null;

export function clickhouseViaRedisStream(): boolean {
  if (process.env.CLICKHOUSE_VIA_REDIS_STREAM === "false") return false;
  if (process.env.CLICKHOUSE_VIA_REDIS_STREAM === "true") return true;
  return false;
}

function getRedis(): Redis | null {
  if (!clickhouseViaRedisStream()) return null;
  const url = process.env.REDIS_URL?.trim();
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

async function ensureGroup(client: Redis, stream: string): Promise<void> {
  try {
    await client.xgroup("CREATE", stream, GROUP, "0", "MKSTREAM");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("BUSYGROUP")) throw err;
  }
}

export function enqueueTradeChStream(row: TradeChRow): void {
  const client = getRedis();
  if (!client) return;

  void (async () => {
    try {
      if (client.status !== "ready") await client.connect();
      await ensureGroup(client, "pump:ch:trades");
      await client.xadd(
        "pump:ch:trades",
        "*",
        "payload",
        JSON.stringify({
          ...row,
          block_time: row.block_time.toISOString(),
        })
      );
    } catch (err) {
      console.warn(
        "[indexer-sol] ch stream trade XADD failed",
        err instanceof Error ? err.message : err
      );
    }
  })();
}

export type CandleChRow = {
  token_address: string;
  candle_interval: string;
  bucket_start: string;
  open_sol: number;
  high_sol: number;
  low_sol: number;
  close_sol: number;
  volume_sol: number;
  buy_volume_sol: number;
  trade_count: number;
};

export function enqueueCandlesChStream(rows: CandleChRow[]): void {
  if (rows.length === 0) return;
  const client = getRedis();
  if (!client) return;

  void (async () => {
    try {
      if (client.status !== "ready") await client.connect();
      await ensureGroup(client, "pump:ch:candles");
      for (const row of rows) {
        await client.xadd("pump:ch:candles", "*", "payload", JSON.stringify(row));
      }
    } catch (err) {
      console.warn(
        "[indexer-sol] ch stream candles XADD failed",
        err instanceof Error ? err.message : err
      );
    }
  })();
}

export async function closeChStreamRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => undefined);
    redis = null;
  }
}

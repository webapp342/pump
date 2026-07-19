import { Redis } from "ioredis";
import type { TradePublishPayload } from "./redis-types.js";

export type { CandleWsUpdatePayload, TradePublishPayload } from "./redis-types.js";

let redis: Redis | null = null;

const STREAM_MAX_LEN = 200;

function redisEnabled(): boolean {
  return process.env.REDIS_PUBLISH_ENABLED === "true" && Boolean(process.env.REDIS_URL?.trim());
}

function getRedis(): Redis | null {
  if (!redisEnabled()) return null;

  if (!redis) {
    const url = process.env.REDIS_URL!.trim();
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", (error: Error) => {
      console.warn("[indexer-sol] redis publish error:", error.message);
    });
  }

  return redis;
}

function roomKey(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

async function publishToRooms(
  channel: string,
  rooms: string[],
  payload: Record<string, unknown>
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  const message = JSON.stringify(payload);

  try {
    if (client.status !== "ready") {
      await client.connect();
    }
    await client.publish(channel, message);
    for (const room of rooms) {
      await client.xadd(
        `pump:stream:${room}`,
        "MAXLEN",
        "~",
        String(STREAM_MAX_LEN),
        "*",
        "p",
        message
      );
    }
  } catch (error) {
    console.warn(
      "[indexer-sol] redis publish failed:",
      error instanceof Error ? error.message : error
    );
  }
}

async function nextTradeSeq(tokenAddress: string): Promise<number | undefined> {
  const client = getRedis();
  if (!client) return undefined;

  try {
    if (client.status !== "ready") {
      await client.connect();
    }
    const seq = await client.incr(`pump:seq:trade:${roomKey(tokenAddress)}`);
    return seq;
  } catch {
    return undefined;
  }
}

export async function publishTrade(payload: TradePublishPayload): Promise<void> {
  const token = roomKey(payload.tokenAddress);
  const seq = await nextTradeSeq(token);
  const enriched: TradePublishPayload = {
    ...payload,
    seq,
    bonding: {
      ...payload.bonding,
      spotPriceZug: payload.bonding.spotPriceZug ?? payload.bonding.lastPriceZug,
    },
  };

  const channel = `pump:trade:${token}`;
  const rooms = [`token:${token}`, "arena"];

  await publishToRooms(channel, rooms, enriched);
}

export type WalletTradePublishPayload = {
  type: "wallet_trade";
  seq?: number;
  walletAddress: string;
  tokenAddress: string;
  trade: TradePublishPayload["trade"];
  position: {
    tokenBalance: string;
    remainingCostBasisZug: string;
    realizedPnlZug: string;
    remainingCostBasisUsd: string;
    realizedPnlUsd: string;
  };
  bonding: Pick<
    TradePublishPayload["bonding"],
    "lastPriceZug" | "marketCapZug" | "reserveZug" | "tokenSold" | "spotPriceZug"
  >;
};

export async function publishWalletTrade(payload: WalletTradePublishPayload): Promise<void> {
  const wallet = roomKey(payload.walletAddress);
  const token = roomKey(payload.tokenAddress);
  const seq = await nextTradeSeq(token);

  const enriched = {
    ...payload,
    seq,
    bonding: {
      ...payload.bonding,
      spotPriceZug: payload.bonding.spotPriceZug ?? payload.bonding.lastPriceZug,
    },
  };

  const channel = `pump:wallet:${wallet}`;
  await publishToRooms(channel, [`wallet:${wallet}`], enriched);
}

export async function closeRedisPublish(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => undefined);
    redis = null;
  }
}

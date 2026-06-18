import { Redis } from "ioredis";

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
      console.warn("redis publish error:", error.message);
    });
  }

  return redis;
}

export type TradePublishPayload = {
  type: "trade";
  seq?: number;
  tokenAddress: string;
  trade: {
    id: string;
    side: string;
    traderAddress: string;
    zugAmount: string;
    tokenAmount: string;
    priceZug: string;
    txHash: string;
    logIndex: number;
    blockTime: string;
  };
  bonding: {
    reserveZug: string;
    tokenSold?: string;
    marketCapZug: string;
    spotPriceZug?: string;
    lastPriceZug: string;
    progressBps: number;
    tradeCount: number;
    holderCount: number;
    volume24hZug?: string;
  };
};

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
    console.warn("redis publish failed:", error instanceof Error ? error.message : error);
  }
}

async function nextTradeSeq(tokenAddress: string): Promise<number | undefined> {
  const client = getRedis();
  if (!client) return undefined;

  try {
    if (client.status !== "ready") {
      await client.connect();
    }
    const seq = await client.incr(`pump:seq:trade:${tokenAddress.toLowerCase()}`);
    return seq;
  } catch {
    return undefined;
  }
}

export async function publishTrade(payload: TradePublishPayload): Promise<void> {
  const token = payload.tokenAddress.toLowerCase();
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
  };
  bonding: Pick<
    TradePublishPayload["bonding"],
    "lastPriceZug" | "marketCapZug" | "reserveZug" | "tokenSold" | "spotPriceZug"
  >;
};

export async function publishWalletTrade(payload: WalletTradePublishPayload): Promise<void> {
  const wallet = payload.walletAddress.toLowerCase();
  const token = payload.tokenAddress.toLowerCase();
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

export async function publishKoth(payload: Record<string, unknown>): Promise<void> {
  const client = getRedis();
  if (!client) return;

  const message = JSON.stringify({ type: "koth", ...payload });

  try {
    if (client.status !== "ready") {
      await client.connect();
    }
    await client.publish("pump:koth", message);
    await client.xadd(
      "pump:stream:arena",
      "MAXLEN",
      "~",
      String(STREAM_MAX_LEN),
      "*",
      "p",
      message
    );
  } catch (error) {
    console.warn("redis publish koth failed:", error instanceof Error ? error.message : error);
  }
}

export async function closeRedis(): Promise<void> {
  if (!redis) return;
  await redis.quit();
  redis = null;
}

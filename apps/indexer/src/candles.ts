import type pg from "pg";
import { parseUnits } from "viem";
import { ratioWeiToDecimal, weiToDecimal } from "./utils.js";
import { fetchIndexerNativeUsdRate } from "./native-usd.js";

export const CANDLE_INTERVALS = ["15s", "1m", "5m", "15m", "1h", "4h"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

const INTERVAL_MS: Record<CandleInterval, number> = {
  "15s": 15_000,
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

export function incrementalCandlesEnabled(): boolean {
  const value = process.env.INCREMENTAL_CANDLES;
  if (value === "false") return false;
  if (value === "true") return true;
  return process.env.INCREMENTAL_BOARD_STATS !== "false";
}

/** Intervals broadcast on WS (all intervals still written to DB). */
export function wsCandleIntervals(): CandleInterval[] {
  const raw = process.env.CANDLE_WS_INTERVALS ?? "1m,5m";
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return CANDLE_INTERVALS.filter((interval) => allowed.has(interval));
}

export type CandleWsUpdate = {
  interval: CandleInterval;
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  buyVolume: string;
  tradeCount: number;
  isNewBucket: boolean;
};

export type TradeCandleInput = {
  tokenAddress: string;
  blockTime: Date;
  isBuy: boolean;
  reserveAfter: bigint;
  soldAfter: bigint;
  zugAmount: bigint;
  feeZug: bigint;
  tokenAmount: bigint;
};

function virtualReserves(): { virtualZug: bigint; virtualToken: bigint } {
  const virtualZug = BigInt(process.env.BONDING_VIRTUAL_ETH_RESERVE_WEI ?? process.env.BONDING_VIRTUAL_ZUG_RESERVE_WEI ?? `${5n * 10n ** 18n}`);
  const virtualToken = 1_000_000_000n * 10n ** 18n;
  return { virtualZug, virtualToken };
}

export function spotPriceZugFromReserves(
  reserveZug: bigint,
  soldTokens: bigint,
  virtualZug?: bigint,
  virtualToken?: bigint
): string {
  const defaults = virtualReserves();
  const vz = virtualZug ?? defaults.virtualZug;
  const vt = virtualToken ?? defaults.virtualToken;
  const poolZug = vz + reserveZug;
  const poolTokens = vt - soldTokens;
  if (poolTokens <= 0n || poolZug <= 0n) return "0";
  return ratioWeiToDecimal(poolZug, poolTokens);
}

export function reservesBeforeTrade(
  isBuy: boolean,
  reserveAfter: bigint,
  soldAfter: bigint,
  zugAmount: bigint,
  feeZug: bigint,
  tokenAmount: bigint
): { reserveBefore: bigint; soldBefore: bigint } {
  if (isBuy) {
    return {
      reserveBefore: reserveAfter - (zugAmount - feeZug),
      soldBefore: soldAfter - tokenAmount,
    };
  }
  return {
    reserveBefore: reserveAfter + zugAmount,
    soldBefore: soldAfter + tokenAmount,
  };
}

export function bucketTimestamp(blockTime: Date, interval: CandleInterval): Date {
  const intervalMs = INTERVAL_MS[interval];
  const alignedMs = Math.floor(blockTime.getTime() / intervalMs) * intervalMs;
  return new Date(alignedMs);
}

function touchPrices(open: number, spotBefore: number, spotAfter: number): {
  open: number;
  high: number;
  low: number;
  close: number;
} {
  const prices = [open, spotBefore, spotAfter];
  return {
    open,
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: spotAfter,
  };
}

async function readBondingVirtualReserves(
  client: pg.PoolClient,
  tokenAddress: string
): Promise<{ virtualZug: bigint; virtualToken: bigint }> {
  const defaults = virtualReserves();
  const result = await client.query<{
    virtual_zug_reserve: string;
    virtual_token_reserve: string;
  }>(
    `
      SELECT virtual_zug_reserve::text, virtual_token_reserve::text
      FROM bonding_states
      WHERE token_address = $1
      LIMIT 1
    `,
    [tokenAddress]
  );
  const row = result.rows[0];
  if (!row) return defaults;

  try {
    const virtualZug = parseUnits(row.virtual_zug_reserve || "5", 18);
    const virtualToken = parseUnits(row.virtual_token_reserve || "1000000000", 18);
    return {
      virtualZug: virtualZug > 0n ? virtualZug : defaults.virtualZug,
      virtualToken: virtualToken > 0n ? virtualToken : defaults.virtualToken,
    };
  } catch {
    return defaults;
  }
}

async function readPriorBucketClose(
  client: pg.PoolClient,
  tokenAddress: string,
  interval: CandleInterval,
  bucketTs: Date
): Promise<number | null> {
  const prior = await client.query<{ close_zug: string }>(
    `
      SELECT close_zug::text
      FROM token_candles
      WHERE token_address = $1
        AND candle_interval = $2
        AND bucket_ts < $3::timestamptz
      ORDER BY bucket_ts DESC
      LIMIT 1
    `,
    [tokenAddress, interval, bucketTs]
  );
  const close = Number(prior.rows[0]?.close_zug ?? 0);
  return Number.isFinite(close) && close > 0 ? close : null;
}

async function upsertIntervalCandle(
  client: pg.PoolClient,
  input: TradeCandleInput,
  interval: CandleInterval,
  spotBefore: number,
  spotAfter: number,
  volumeZug: number,
  buyVolumeZug: number,
  nativeUsdRate: number | null
): Promise<CandleWsUpdate | null> {
  if (spotAfter <= 0 || !Number.isFinite(spotAfter)) return null;

  const bucketTs = bucketTimestamp(input.blockTime, interval);
  const existing = await client.query<{ bucket_ts: Date }>(
    `
      SELECT bucket_ts
      FROM token_candles
      WHERE token_address = $1
        AND candle_interval = $2
        AND bucket_ts = $3::timestamptz
      LIMIT 1
    `,
    [input.tokenAddress, interval, bucketTs]
  );
  const isNewBucket = existing.rowCount === 0;

  const priorClose = isNewBucket
    ? await readPriorBucketClose(client, input.tokenAddress, interval, bucketTs)
    : null;
  const spotOpen = spotBefore > 0 && Number.isFinite(spotBefore) ? spotBefore : spotAfter;
  const open = priorClose ?? (isNewBucket ? spotAfter : spotOpen);
  const ohlc = touchPrices(open, spotOpen, spotAfter);
  const closeUsd =
    nativeUsdRate != null && nativeUsdRate > 0 ? spotAfter * nativeUsdRate : null;

  const result = await client.query<{
    open_zug: string;
    high_zug: string;
    low_zug: string;
    close_zug: string;
    volume_zug: string;
    buy_volume_zug: string;
    trade_count: number;
  }>(
    `
      INSERT INTO token_candles (
        token_address,
        candle_interval,
        bucket_ts,
        open_zug,
        high_zug,
        low_zug,
        close_zug,
        volume_zug,
        buy_volume_zug,
        trade_count,
        close_usd,
        native_usd_rate,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, now())
      ON CONFLICT (token_address, candle_interval, bucket_ts) DO UPDATE SET
        high_zug = GREATEST(token_candles.high_zug, EXCLUDED.high_zug),
        low_zug = LEAST(token_candles.low_zug, EXCLUDED.low_zug),
        close_zug = EXCLUDED.close_zug,
        volume_zug = token_candles.volume_zug + EXCLUDED.volume_zug,
        buy_volume_zug = token_candles.buy_volume_zug + EXCLUDED.buy_volume_zug,
        trade_count = token_candles.trade_count + 1,
        close_usd = EXCLUDED.close_usd,
        native_usd_rate = EXCLUDED.native_usd_rate,
        updated_at = now()
      RETURNING
        open_zug::text,
        high_zug::text,
        low_zug::text,
        close_zug::text,
        volume_zug::text,
        buy_volume_zug::text,
        trade_count
    `,
    [
      input.tokenAddress,
      interval,
      bucketTs,
      String(ohlc.open),
      String(ohlc.high),
      String(ohlc.low),
      String(ohlc.close),
      String(volumeZug),
      String(buyVolumeZug),
      closeUsd,
      nativeUsdRate,
    ]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    interval,
    time: Math.floor(bucketTs.getTime() / 1000),
    open: row.open_zug,
    high: row.high_zug,
    low: row.low_zug,
    close: row.close_zug,
    volume: row.volume_zug,
    buyVolume: row.buy_volume_zug,
    tradeCount: row.trade_count,
    isNewBucket,
  };
}

export async function upsertCandlesAfterTrade(
  client: pg.PoolClient,
  input: TradeCandleInput
): Promise<CandleWsUpdate[]> {
  if (!incrementalCandlesEnabled()) return [];

  const { reserveBefore, soldBefore } = reservesBeforeTrade(
    input.isBuy,
    input.reserveAfter,
    input.soldAfter,
    input.zugAmount,
    input.feeZug,
    input.tokenAmount
  );

  const { virtualZug, virtualToken } = await readBondingVirtualReserves(
    client,
    input.tokenAddress
  );

  const spotBefore = Number(
    spotPriceZugFromReserves(reserveBefore, soldBefore, virtualZug, virtualToken)
  );
  const spotAfter = Number(
    spotPriceZugFromReserves(input.reserveAfter, input.soldAfter, virtualZug, virtualToken)
  );
  const gross = Number(weiToDecimal(input.zugAmount));
  const fee = Number(weiToDecimal(input.feeZug));
  const volumeZug = Math.max(0, gross - fee);
  const buyVolumeZug = input.isBuy ? volumeZug : 0;
  const nativeUsdRate = await fetchIndexerNativeUsdRate();
  const wsIntervals = new Set(wsCandleIntervals());

  const updates: CandleWsUpdate[] = [];
  for (const interval of CANDLE_INTERVALS) {
    const update = await upsertIntervalCandle(
      client,
      input,
      interval,
      spotBefore,
      spotAfter,
      volumeZug,
      buyVolumeZug,
      nativeUsdRate
    );
    if (update && wsIntervals.has(interval)) {
      updates.push(update);
    }
  }

  return updates;
}

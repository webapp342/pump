import type pg from "pg";
import type { CandleWsUpdatePayload } from "./redis-types.js";
import { queryLatestCandleClose } from "./clickhouse-query.js";
import { readHotCandleUpdate } from "./redis-hot-cache.js";

export const CANDLE_INTERVALS = ["5m", "15m", "1h", "4h"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

const INTERVAL_MS: Record<CandleInterval, number> = {
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

/** When true: OHLC → ClickHouse + Redis only (no PG token_candles). Enable after 7d green parity. */
export function skipPgTokenCandles(): boolean {
  return process.env.SKIP_PG_TOKEN_CANDLES === "true";
}

export function wsCandleIntervals(): CandleInterval[] {
  const raw = process.env.CANDLE_WS_INTERVALS ?? "5m";
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return CANDLE_INTERVALS.filter((interval) => allowed.has(interval));
}

export type TradeCandleInput = {
  tokenAddress: string;
  blockTime: Date;
  isBuy: boolean;
  spotBefore: number;
  spotAfter: number;
  volumeZug: number;
  buyVolumeZug: number;
  /** Trade-time SOL/USD — frozen into close_usd / native_usd_rate. */
  nativeUsdRate?: number | null;
};

export function bucketTimestamp(blockTime: Date, interval: CandleInterval): Date {
  const intervalMs = INTERVAL_MS[interval];
  const alignedMs = Math.floor(blockTime.getTime() / intervalMs) * intervalMs;
  return new Date(alignedMs);
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
): Promise<CandleWsUpdatePayload | null> {
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
  const { open, high, low, close } = tradeBucketOhlc(
    spotBefore,
    spotAfter,
    priorClose,
    isNewBucket
  );
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
      String(open),
      String(high),
      String(low),
      String(close),
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

function resolveSpotOpen(spotBefore: number, spotAfter: number, priorClose: number | null): number {
  let spotOpen = spotBefore > 0 && Number.isFinite(spotBefore) ? spotBefore : spotAfter;
  if (spotAfter > 0 && spotOpen > 0) {
    const ratio = spotOpen / spotAfter;
    if (ratio > 4 || ratio < 1 / 4) {
      spotOpen = priorClose != null && priorClose > 0 ? priorClose : spotAfter;
    }
  }
  return spotOpen;
}

/** Wick extremes use raw spotBefore; spotOpen clamp is for body open only. */
function wickTouchPrice(spotBefore: number, spotAfter: number, spotOpen: number): number {
  if (spotBefore > 0 && Number.isFinite(spotBefore)) return spotBefore;
  return spotOpen > 0 && Number.isFinite(spotOpen) ? spotOpen : spotAfter;
}

function tradeBucketOhlc(
  spotBefore: number,
  spotAfter: number,
  priorClose: number | null,
  isNewBucket: boolean
): { open: number; high: number; low: number; close: number } {
  const spotOpen = resolveSpotOpen(spotBefore, spotAfter, priorClose);
  const open = priorClose ?? (isNewBucket ? spotAfter : spotOpen);
  const touch = wickTouchPrice(spotBefore, spotAfter, spotOpen);
  const prices = [open, touch, spotAfter];
  return {
    open,
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: spotAfter,
  };
}

/** CH + Redis path when SKIP_PG_TOKEN_CANDLES=true (no PG token_candles write/read). */
async function computeIntervalCandleSkipPg(
  input: TradeCandleInput,
  interval: CandleInterval,
  spotBefore: number,
  spotAfter: number,
  volumeZug: number,
  buyVolumeZug: number
): Promise<CandleWsUpdatePayload | null> {
  if (spotAfter <= 0 || !Number.isFinite(spotAfter)) return null;

  const bucketTs = bucketTimestamp(input.blockTime, interval);
  const bucketSec = Math.floor(bucketTs.getTime() / 1000);
  const existingHot = await readHotCandleUpdate(input.tokenAddress, interval);
  const isNewBucket = !existingHot || existingHot.time !== bucketSec;

  const priorClose = isNewBucket
    ? await queryLatestCandleClose(input.tokenAddress, interval)
    : null;
  const spotOpen = resolveSpotOpen(spotBefore, spotAfter, priorClose);
  const touch = wickTouchPrice(spotBefore, spotAfter, spotOpen);

  let open: number;
  let high: number;
  let low: number;
  let close: number;
  let volume: number;
  let buyVolume: number;
  let tradeCount: number;

  if (isNewBucket) {
    const ohlc = tradeBucketOhlc(spotBefore, spotAfter, priorClose, true);
    open = ohlc.open;
    high = ohlc.high;
    low = ohlc.low;
    close = ohlc.close;
    volume = volumeZug;
    buyVolume = buyVolumeZug;
    tradeCount = 1;
  } else {
    open = Number(existingHot!.open);
    high = Math.max(Number(existingHot!.high), touch, spotAfter);
    low = Math.min(Number(existingHot!.low), touch, spotAfter);
    close = spotAfter;
    volume = Number(existingHot!.volume) + volumeZug;
    buyVolume = Number(existingHot!.buyVolume) + buyVolumeZug;
    tradeCount = existingHot!.tradeCount + 1;
  }

  return {
    interval,
    time: bucketSec,
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: String(volume),
    buyVolume: String(buyVolume),
    tradeCount,
    isNewBucket,
  };
}

async function computeCandlesSkipPg(input: TradeCandleInput): Promise<CandleWsUpdatePayload[]> {
  const wsIntervals = new Set(wsCandleIntervals());
  const updates: CandleWsUpdatePayload[] = [];

  for (const interval of CANDLE_INTERVALS) {
    const update = await computeIntervalCandleSkipPg(
      input,
      interval,
      input.spotBefore,
      input.spotAfter,
      input.volumeZug,
      input.buyVolumeZug
    );
    if (update && wsIntervals.has(interval)) {
      updates.push(update);
    }
  }

  return updates;
}

export async function upsertCandlesAfterTrade(
  client: pg.PoolClient,
  input: TradeCandleInput
): Promise<CandleWsUpdatePayload[]> {
  if (!incrementalCandlesEnabled()) return [];

  if (skipPgTokenCandles()) {
    return computeCandlesSkipPg(input);
  }

  const wsIntervals = new Set(wsCandleIntervals());
  const updates: CandleWsUpdatePayload[] = [];
  const rate =
    input.nativeUsdRate != null &&
    Number.isFinite(input.nativeUsdRate) &&
    input.nativeUsdRate > 0
      ? input.nativeUsdRate
      : null;

  for (const interval of CANDLE_INTERVALS) {
    const update = await upsertIntervalCandle(
      client,
      input,
      interval,
      input.spotBefore,
      input.spotAfter,
      input.volumeZug,
      input.buyVolumeZug,
      rate
    );
    if (update && wsIntervals.has(interval)) {
      updates.push(update);
    }
  }

  return updates;
}

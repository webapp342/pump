import type { CandleInterval, CandleWsUpdate } from "@/lib/candles";
import type { StoredTokenCandleRow } from "@/lib/db/launchpad";
import { clickhouseCandlesEnabled, clickhouseQueryJson } from "@/lib/clickhouse/client";

const TABLE_BY_INTERVAL: Partial<Record<CandleInterval, string>> = {
  "5m": "candles_5m",
  "15m": "candles_15m",
  "1h": "candles_1h",
  "4h": "candles_4h",
};

/** ClickHouse bucket expression — matches TradingView bar open time (interval start). */
const BUCKET_EXPR: Record<CandleInterval, string> = {
  "5m": "toStartOfFiveMinutes(block_time)",
  "15m": "toStartOfFifteenMinutes(block_time)",
  "1h": "toStartOfHour(block_time)",
  "4h": "toStartOfInterval(block_time, INTERVAL 4 HOUR)",
};

type ChCandleRow = {
  bucket_sec: number;
  open_sol: number;
  high_sol: number;
  low_sol: number;
  close_sol: number;
  volume_sol: number;
  buy_volume_sol: number;
  trade_count: number;
};

export type ClickHouseCandleSource = "trades_raw" | "candles_mv" | "candles_spot";

function mapChRows(rows: ChCandleRow[]): StoredTokenCandleRow[] {
  return rows.map((row) => ({
    bucketSec: Number(row.bucket_sec),
    openZug: String(row.open_sol),
    highZug: String(row.high_sol),
    lowZug: String(row.low_sol),
    closeZug: String(row.close_sol),
    volumeZug: String(row.volume_sol),
    buyVolumeZug: String(row.buy_volume_sol ?? 0),
    tradeCount: Number(row.trade_count) || 0,
  }));
}

/**
 * History SSOT (research / ClickHouse OHLC pattern):
 * open  = argMin(first print, timestamp)
 * high  = max(price path)
 * low   = min(price path)
 * close = argMax(last print, timestamp)
 *
 * Bonding: first print = spot_before (fallback spot_after for legacy rows).
 */
export async function listTokenCandlesFromTradesRaw(
  tokenAddress: string,
  interval: CandleInterval,
  limit = 1000
): Promise<StoredTokenCandleRow[] | null> {
  if (!clickhouseCandlesEnabled()) return null;
  const bucketExpr = BUCKET_EXPR[interval];
  if (!bucketExpr) return null;

  const capped = Math.min(Math.max(limit, 1), 4000);
  const addr = tokenAddress.replace(/'/g, "\\'");

  // open_print / after_print — same economics as indexer live tip.
  const openPrint =
    "if(spot_before_sol > 0, spot_before_sol, spot_price_sol)";
  const afterPrint = "spot_price_sol";
  const touchHigh = `greatest(${openPrint}, ${afterPrint})`;
  const touchLow = `least(${openPrint}, ${afterPrint})`;

  try {
    const rows = await clickhouseQueryJson<ChCandleRow>(
      `
      SELECT
        toUnixTimestamp(${bucketExpr}) AS bucket_sec,
        argMin(${openPrint}, block_time) AS open_sol,
        max(${touchHigh}) AS high_sol,
        min(${touchLow}) AS low_sol,
        argMax(${afterPrint}, block_time) AS close_sol,
        sum(sol_amount) AS volume_sol,
        sumIf(sol_amount, side = 'buy') AS buy_volume_sol,
        count() AS trade_count
      FROM trades_raw
      WHERE token_address = '${addr}'
        AND spot_price_sol > 0
      GROUP BY bucket_sec
      ORDER BY bucket_sec DESC
      LIMIT ${capped}
      `
    );

    if (rows.length === 0) return [];
    return mapChRows(rows);
  } catch (error) {
    console.warn("[clickhouse] trades_raw OHLC query failed", error);
    return null;
  }
}

/** Indexer-written spot OHLC (legacy / fallback when trades_raw empty). */
export async function listTokenCandlesFromClickHouseSpot(
  tokenAddress: string,
  interval: CandleInterval,
  limit = 1000
): Promise<StoredTokenCandleRow[] | null> {
  if (!clickhouseCandlesEnabled()) return null;

  const capped = Math.min(Math.max(limit, 1), 4000);
  const addr = tokenAddress.replace(/'/g, "\\'");

  try {
    const rows = await clickhouseQueryJson<ChCandleRow>(
      `
      SELECT
        toUnixTimestamp(bucket_start) AS bucket_sec,
        argMax(open_sol, updated_at) AS open_sol,
        argMax(high_sol, updated_at) AS high_sol,
        argMax(low_sol, updated_at) AS low_sol,
        argMax(close_sol, updated_at) AS close_sol,
        argMax(volume_sol, updated_at) AS volume_sol,
        argMax(buy_volume_sol, updated_at) AS buy_volume_sol,
        argMax(trade_count, updated_at) AS trade_count
      FROM candles_spot
      WHERE token_address = '${addr}'
        AND candle_interval = '${interval}'
      GROUP BY bucket_start
      ORDER BY bucket_start DESC
      LIMIT ${capped}
      `
    );

    if (rows.length === 0) return [];
    return mapChRows(rows);
  } catch (error) {
    console.warn("[clickhouse] candles_spot query failed", error);
    return null;
  }
}

/** AggregatingMergeTree rollups from trades_raw (argMin/argMax) — secondary history. */
export async function listTokenCandlesFromClickHouseMv(
  tokenAddress: string,
  interval: CandleInterval,
  limit = 1000
): Promise<StoredTokenCandleRow[] | null> {
  if (!clickhouseCandlesEnabled()) return null;
  const table = TABLE_BY_INTERVAL[interval];
  if (!table) return null;

  const capped = Math.min(Math.max(limit, 1), 4000);
  const addr = tokenAddress.replace(/'/g, "\\'");

  try {
    const rows = await clickhouseQueryJson<ChCandleRow>(
      `
      SELECT
        toUnixTimestamp(bucket_start) AS bucket_sec,
        argMinMerge(open_sol) AS open_sol,
        maxMerge(high_sol) AS high_sol,
        minMerge(low_sol) AS low_sol,
        argMaxMerge(close_sol) AS close_sol,
        sumMerge(volume_sol) AS volume_sol,
        0 AS buy_volume_sol,
        countMerge(trade_count) AS trade_count
      FROM ${table}
      WHERE token_address = '${addr}'
      GROUP BY bucket_start
      ORDER BY bucket_start DESC
      LIMIT ${capped}
      `
    );

    if (rows.length === 0) return [];
    return mapChRows(rows);
  } catch (error) {
    console.warn("[clickhouse] candles MV query failed", error);
    return null;
  }
}

/**
 * Deep history preference (enterprise chart SSOT):
 * 1) trades_raw dynamic OHLC (argMin/argMax + spot_before)
 * 2) candles_mv (same formula, pre-aggregated)
 * 3) candles_spot (indexer dual-write fallback)
 */
export async function listTokenCandlesFromClickHouse(
  tokenAddress: string,
  interval: CandleInterval,
  limit = 1000
): Promise<{ rows: StoredTokenCandleRow[]; source: ClickHouseCandleSource } | null> {
  const fromTrades = await listTokenCandlesFromTradesRaw(tokenAddress, interval, limit);
  if (fromTrades && fromTrades.length > 0) {
    return { rows: fromTrades, source: "trades_raw" };
  }

  const mv = await listTokenCandlesFromClickHouseMv(tokenAddress, interval, limit);
  if (mv && mv.length > 0) {
    return { rows: mv, source: "candles_mv" };
  }

  const spot = await listTokenCandlesFromClickHouseSpot(tokenAddress, interval, limit);
  if (spot && spot.length > 0) {
    return { rows: spot, source: "candles_spot" };
  }

  if (fromTrades && fromTrades.length === 0) {
    return { rows: [], source: "trades_raw" };
  }
  return null;
}

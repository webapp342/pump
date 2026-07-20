import type { CandleInterval } from "@/lib/candles";
import type { StoredTokenCandleRow } from "@/lib/db/launchpad";
import { clickhouseCandlesEnabled, clickhouseQueryJson } from "@/lib/clickhouse/client";

const TABLE_BY_INTERVAL: Partial<Record<CandleInterval, string>> = {
  "5m": "candles_5m",
  "15m": "candles_15m",
  "1h": "candles_1h",
  "4h": "candles_4h",
};

type ChCandleRow = {
  bucket_sec: number;
  open_sol: number;
  high_sol: number;
  low_sol: number;
  close_sol: number;
  volume_sol: number;
  trade_count: number;
};

/** Deep history from ClickHouse AggregatingMergeTree rollups (spot SOL). */
export async function listTokenCandlesFromClickHouse(
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
        countMerge(trade_count) AS trade_count
      FROM ${table}
      WHERE token_address = '${addr}'
      GROUP BY bucket_start
      ORDER BY bucket_start DESC
      LIMIT ${capped}
      `
    );

    if (rows.length === 0) return [];

    return rows.map((row) => ({
      bucketSec: Number(row.bucket_sec),
      openZug: String(row.open_sol),
      highZug: String(row.high_sol),
      lowZug: String(row.low_sol),
      closeZug: String(row.close_sol),
      volumeZug: String(row.volume_sol),
      buyVolumeZug: "0",
      tradeCount: Number(row.trade_count) || 0,
    }));
  } catch (error) {
    console.warn("[clickhouse] candles query failed — falling back to PG", error);
    return null;
  }
}

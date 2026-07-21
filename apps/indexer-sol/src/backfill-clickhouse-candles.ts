/**
 * Backfill pump.candles_spot from PostgreSQL token_candles (authoritative OHLC).
 *
 *   npm run backfill-clickhouse-candles -w @pump/indexer-sol
 */
import "dotenv/config";
import pg from "pg";
import { enqueueCandlesClickHouse } from "./clickhouse-candles.js";

const pool = new pg.Pool({ connectionString: process.env.LAUNCHPAD_DATABASE_URL });
const BATCH = 500;

type Row = {
  token_address: string;
  candle_interval: string;
  bucket_sec: string;
  open_zug: string;
  high_zug: string;
  low_zug: string;
  close_zug: string;
  volume_zug: string;
  buy_volume_zug: string;
  trade_count: number;
};

async function main(): Promise<void> {
  if (!process.env.CLICKHOUSE_URL?.trim()) {
    throw new Error("Set CLICKHOUSE_URL");
  }
  process.env.CLICKHOUSE_DUAL_WRITE = process.env.CLICKHOUSE_DUAL_WRITE ?? "true";

  const count = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM token_candles`
  );
  const total = Number(count.rows[0]?.n ?? 0);
  console.log(`backfill-clickhouse-candles: pg rows=${total}`);

  let offset = 0;
  let written = 0;

  while (offset < total) {
    const batch = await pool.query<Row>(
      `
        SELECT
          token_address,
          candle_interval,
          EXTRACT(EPOCH FROM bucket_ts)::bigint::text AS bucket_sec,
          open_zug::text,
          high_zug::text,
          low_zug::text,
          close_zug::text,
          volume_zug::text,
          buy_volume_zug::text,
          trade_count
        FROM token_candles
        ORDER BY token_address, candle_interval, bucket_ts
        LIMIT $1 OFFSET $2
      `,
      [BATCH, offset]
    );

    if (batch.rowCount === 0) break;

    const byToken = new Map<string, typeof batch.rows>();
    for (const row of batch.rows) {
      const list = byToken.get(row.token_address) ?? [];
      list.push(row);
      byToken.set(row.token_address, list);
    }

    for (const [token, rows] of byToken) {
      const updates = rows.map((row) => ({
        interval: row.candle_interval,
        time: Number(row.bucket_sec),
        open: row.open_zug,
        high: row.high_zug,
        low: row.low_zug,
        close: row.close_zug,
        volume: row.volume_zug,
        buyVolume: row.buy_volume_zug,
        tradeCount: row.trade_count,
        isNewBucket: false,
      }));
      enqueueCandlesClickHouse(token, updates);
      written += updates.length;
    }

    offset += batch.rowCount ?? 0;
    console.log(`  … flushed ${offset}/${total}`);
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`backfill-clickhouse-candles: enqueued ${written} rows (async HTTP insert)`);
  await pool.end();
  await new Promise((r) => setTimeout(r, 3_000));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

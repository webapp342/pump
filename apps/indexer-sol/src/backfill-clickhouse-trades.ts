/**
 * Backfill PostgreSQL trades → ClickHouse trades_raw (triggers candle MVs).
 *
 *   npm run backfill-clickhouse-trades -w @pump/indexer-sol
 */
import "dotenv/config";
import pg from "pg";
import { clickhouseDualWriteEnabled } from "./clickhouse.js";

const pool = new pg.Pool({ connectionString: process.env.LAUNCHPAD_DATABASE_URL });
const BATCH = 500;

async function insertBatch(
  rows: Array<Record<string, string | number | null>>
): Promise<void> {
  const base = process.env.CLICKHOUSE_URL!.replace(/\/$/, "");
  const database = process.env.CLICKHOUSE_DATABASE ?? "pump";
  const url = `${base}/?database=${encodeURIComponent(database)}&query=${encodeURIComponent(
    "INSERT INTO trades_raw FORMAT JSONEachRow"
  )}`;
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`CH insert failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  process.env.CLICKHOUSE_DUAL_WRITE = process.env.CLICKHOUSE_DUAL_WRITE ?? "true";
  if (!clickhouseDualWriteEnabled()) {
    throw new Error("Set CLICKHOUSE_URL (+ CLICKHOUSE_DUAL_WRITE=true)");
  }

  let offset = 0;
  let total = 0;
  for (;;) {
    const result = await pool.query<{
      event_id: string;
      token_address: string;
      trader_address: string;
      side: string;
      zug_amount: string;
      token_amount: string;
      price_zug: string;
      spot_price_zug: string | null;
      fee_zug: string;
      tx_hash: string;
      log_index: number;
      block_number: string;
      block_time: Date;
      native_usd_rate: string | null;
    }>(
      `
        SELECT
          event_id,
          token_address,
          trader_address,
          side,
          zug_amount::text,
          token_amount::text,
          price_zug::text,
          spot_price_zug::text,
          COALESCE(fee_zug, 0)::text AS fee_zug,
          tx_hash,
          log_index,
          block_number::text,
          block_time,
          native_usd_rate::text
        FROM trades
        ORDER BY block_time ASC, block_number ASC, log_index ASC
        OFFSET $1 LIMIT $2
      `,
      [offset, BATCH]
    );

    if (result.rows.length === 0) break;

    const payload = result.rows.map((row) => ({
      event_id: row.event_id,
      token_address: row.token_address,
      trader_address: row.trader_address,
      side: row.side,
      sol_amount: Number(row.zug_amount),
      token_amount: Number(row.token_amount),
      price_sol: Number(row.price_zug),
      spot_price_sol: Number(row.spot_price_zug ?? row.price_zug),
      fee_sol: Number(row.fee_zug),
      tx_hash: row.tx_hash,
      log_index: row.log_index,
      slot: Number(row.block_number) || 0,
      block_time: row.block_time.toISOString().replace("T", " ").replace("Z", ""),
      native_usd_rate:
        row.native_usd_rate != null && Number(row.native_usd_rate) > 0
          ? Number(row.native_usd_rate)
          : null,
    }));

    await insertBatch(payload);
    total += payload.length;
    offset += result.rows.length;
    console.log(`backfill-clickhouse-trades: inserted ${total}`);
    if (result.rows.length < BATCH) break;
  }

  console.log(`backfill-clickhouse-trades: done total=${total}`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

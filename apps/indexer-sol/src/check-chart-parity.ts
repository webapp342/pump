/**
 * Chart parity smoke: bonding last_price_zug vs latest 5m candle close_zug.
 * Drift > BOARD_MCAP_DRIFT_BPS (default 10 = 0.1%) → exit 1.
 *
 *   npm run check-chart-parity -w @pump/indexer-sol
 */
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.LAUNCHPAD_DATABASE_URL });
const DRIFT_BPS = Number(process.env.BOARD_MCAP_DRIFT_BPS ?? 10);

type Row = {
  token_address: string;
  last_price_zug: string;
  candle_close: string | null;
};

async function main(): Promise<void> {
  const result = await pool.query<Row>(
    `
      SELECT
        b.token_address,
        COALESCE(b.last_price_zug, 0)::text AS last_price_zug,
        (
          SELECT c.close_zug::text
          FROM token_candles c
          WHERE c.token_address = b.token_address
            AND c.candle_interval = '5m'
          ORDER BY c.bucket_ts DESC
          LIMIT 1
        ) AS candle_close
      FROM bonding_states b
      WHERE COALESCE(b.trade_count, 0) > 0
        AND COALESCE(b.last_price_zug, 0) > 0
      ORDER BY b.updated_at DESC
      LIMIT 200
    `
  );

  let checked = 0;
  let violations = 0;
  for (const row of result.rows) {
    const spot = Number(row.last_price_zug);
    const close = row.candle_close != null ? Number(row.candle_close) : null;
    if (!(spot > 0) || close == null || !(close > 0)) continue;
    checked += 1;
    const driftBps = (Math.abs(spot - close) / spot) * 10_000;
    if (driftBps > DRIFT_BPS) {
      console.warn(
        `CHART_DRIFT_BPS=${driftBps.toFixed(2)} token=${row.token_address} spot=${spot} candleClose=${close}`
      );
      violations += 1;
    }
  }

  console.log(
    `check-chart-parity: scanned=${result.rows.length} compared=${checked} violations=${violations} thresholdBps=${DRIFT_BPS}`
  );
  await pool.end();
  if (violations > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * Chart parity smoke: bonding spot vs latest 5m candle close (PG + CH authoritative).
 * Also flags live-bucket wick anomalies (low/close < 0.25).
 *
 * Exit 1 when drift > BOARD_MCAP_DRIFT_BPS (default 10 = 0.1%) or wick violations.
 *
 *   npm run check-chart-parity -w @pump/indexer-sol
 *
 * **7-day green gate (before SKIP_PG_TOKEN_CANDLES=true):**
 * Run daily; record exit 0 in ops log. Enable skip only after 7 consecutive green days
 * with CH candles_spot populated and USE_CLICKHOUSE_CANDLES=true on web.
 */
import "dotenv/config";
import pg from "pg";
import {
  clickhouseQueryEnabled,
  queryLatestCandlesSpotBatch,
} from "./clickhouse-query.js";

const pool = new pg.Pool({ connectionString: process.env.LAUNCHPAD_DATABASE_URL });
const DRIFT_BPS = Number(process.env.BOARD_MCAP_DRIFT_BPS ?? 10);
const WICK_LOW_CLOSE_RATIO = Number(process.env.CHART_WICK_RATIO_MIN ?? 0.25);

type BondingRow = {
  token_address: string;
  last_price_zug: string;
  candle_close_pg: string | null;
};

function driftBps(spot: number, close: number): number {
  return (Math.abs(spot - close) / spot) * 10_000;
}

async function main(): Promise<void> {
  const result = await pool.query<BondingRow>(
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
        ) AS candle_close_pg
      FROM bonding_states b
      WHERE COALESCE(b.trade_count, 0) > 0
        AND COALESCE(b.last_price_zug, 0) > 0
      ORDER BY b.updated_at DESC
      LIMIT 200
    `
  );

  const chByToken = new Map<string, { close: number; low: number; high: number }>();
  if (clickhouseQueryEnabled()) {
    const chRows = await queryLatestCandlesSpotBatch("5m");
    for (const row of chRows) {
      chByToken.set(row.token_address, {
        close: Number(row.close_sol),
        low: Number(row.low_sol),
        high: Number(row.high_sol),
      });
    }
  }

  let comparedPg = 0;
  let comparedCh = 0;
  let driftPg = 0;
  let driftCh = 0;
  let wickViolations = 0;

  for (const row of result.rows) {
    const spot = Number(row.last_price_zug);
    if (!(spot > 0)) continue;

    const closePg = row.candle_close_pg != null ? Number(row.candle_close_pg) : null;
    if (closePg != null && closePg > 0) {
      comparedPg += 1;
      const bps = driftBps(spot, closePg);
      if (bps > DRIFT_BPS) {
        console.warn(
          `CHART_DRIFT_BPS=${bps.toFixed(2)} source=pg token=${row.token_address} spot=${spot} candleClose=${closePg}`
        );
        driftPg += 1;
      }
    }

    const ch = chByToken.get(row.token_address);
    if (ch && ch.close > 0) {
      comparedCh += 1;
      const bps = driftBps(spot, ch.close);
      if (bps > DRIFT_BPS) {
        console.warn(
          `CHART_DRIFT_BPS=${bps.toFixed(2)} source=ch token=${row.token_address} spot=${spot} candleClose=${ch.close}`
        );
        driftCh += 1;
      }
      if (ch.close > 0 && ch.low > 0 && ch.low / ch.close < WICK_LOW_CLOSE_RATIO) {
        console.warn(
          `CHART_WICK_RATIO=${(ch.low / ch.close).toFixed(4)} token=${row.token_address} low=${ch.low} close=${ch.close}`
        );
        wickViolations += 1;
      }
    }
  }

  const violations = driftPg + driftCh + wickViolations;
  console.log(
    [
      `check-chart-parity: scanned=${result.rows.length}`,
      `compared_pg=${comparedPg}`,
      `compared_ch=${comparedCh}`,
      `drift_pg=${driftPg}`,
      `drift_ch=${driftCh}`,
      `wick_violations=${wickViolations}`,
      `thresholdBps=${DRIFT_BPS}`,
      `ch_enabled=${clickhouseQueryEnabled()}`,
    ].join(" ")
  );

  await pool.end();
  if (violations > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

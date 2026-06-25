import pg from "pg";
import { incrementalBoardStatsEnabled } from "./board-stats.js";
import { loadIndexerEnv } from "./load-env.js";

loadIndexerEnv();

const BONDING_VIRTUAL_BNB = 5;
const TOKEN_SUPPLY = 1_000_000_000;

async function main(): Promise<void> {
  const url = process.env.LAUNCHPAD_DATABASE_URL;
  if (!url) {
    throw new Error(
      "LAUNCHPAD_DATABASE_URL is required. Set it in /var/www/pump/Indexer/.env or export before running."
    );
  }

  const pool = new pg.Pool({ connectionString: url, max: 4 });

  try {
    const result = await pool.query(`
      INSERT INTO token_board_stats (
        token_address,
        market_cap_zug,
        spot_price_zug,
        ath_market_cap_zug,
        ath_price_zug,
        reserve_zug,
        token_sold,
        progress_bps,
        trade_count,
        holder_count,
        volume_24h_zug,
        volume_24h_prev_zug,
        trade_count_24h_ago,
        traders_24h,
        updated_at
      )
      SELECT
        b.token_address,
        CASE
          WHEN (${TOKEN_SUPPLY}::numeric - COALESCE(b.token_sold, 0)) > 0
          THEN ((${BONDING_VIRTUAL_BNB}::numeric + COALESCE(b.reserve_zug, 0))
               / (${TOKEN_SUPPLY}::numeric - COALESCE(b.token_sold, 0)))
               * ${TOKEN_SUPPLY}
          ELSE COALESCE(b.market_cap_zug, 0)
        END AS market_cap_zug,
        CASE
          WHEN (${TOKEN_SUPPLY}::numeric - COALESCE(b.token_sold, 0)) > 0
          THEN (${BONDING_VIRTUAL_BNB}::numeric + COALESCE(b.reserve_zug, 0))
               / (${TOKEN_SUPPLY}::numeric - COALESCE(b.token_sold, 0))
          ELSE COALESCE(b.last_price_zug, 0)
        END AS spot_price_zug,
        GREATEST(
          COALESCE(b.market_cap_zug, 0),
          CASE
            WHEN (${TOKEN_SUPPLY}::numeric - COALESCE(b.token_sold, 0)) > 0
            THEN ((${BONDING_VIRTUAL_BNB}::numeric + COALESCE(b.reserve_zug, 0))
                 / (${TOKEN_SUPPLY}::numeric - COALESCE(b.token_sold, 0)))
                 * ${TOKEN_SUPPLY}
            ELSE 0
          END
        ) AS ath_market_cap_zug,
        COALESCE(ts.ath_price_zug, b.last_price_zug) AS ath_price_zug,
        COALESCE(b.reserve_zug, 0) AS reserve_zug,
        COALESCE(b.token_sold, 0) AS token_sold,
        COALESCE(b.progress_bps, 0) AS progress_bps,
        COALESCE(b.trade_count, 0) AS trade_count,
        COALESCE(b.holder_count, 0) AS holder_count,
        COALESCE(ts.volume_24h_zug::numeric, 0) AS volume_24h_zug,
        COALESCE(ts.volume_24h_prev_zug::numeric, 0) AS volume_24h_prev_zug,
        COALESCE(ts.trade_count_24h_ago, 0) AS trade_count_24h_ago,
        COALESCE(ts.traders_24h, 0) AS traders_24h,
        now() AS updated_at
      FROM bonding_states b
      JOIN tokens t ON t.address = b.token_address AND t.is_hidden = false
      LEFT JOIN mv_token_trade_stats ts ON ts.token_address = b.token_address
      ON CONFLICT (token_address) DO UPDATE SET
        market_cap_zug = EXCLUDED.market_cap_zug,
        spot_price_zug = EXCLUDED.spot_price_zug,
        ath_market_cap_zug = GREATEST(
          token_board_stats.ath_market_cap_zug,
          EXCLUDED.ath_market_cap_zug
        ),
        ath_price_zug = GREATEST(
          COALESCE(token_board_stats.ath_price_zug, 0),
          COALESCE(EXCLUDED.ath_price_zug, 0)
        ),
        reserve_zug = EXCLUDED.reserve_zug,
        token_sold = EXCLUDED.token_sold,
        progress_bps = EXCLUDED.progress_bps,
        trade_count = EXCLUDED.trade_count,
        holder_count = EXCLUDED.holder_count,
        volume_24h_zug = EXCLUDED.volume_24h_zug,
        volume_24h_prev_zug = EXCLUDED.volume_24h_prev_zug,
        trade_count_24h_ago = EXCLUDED.trade_count_24h_ago,
        traders_24h = EXCLUDED.traders_24h,
        updated_at = now()
      RETURNING token_address
    `);

    console.log(`backfill-board-stats: upserted ${result.rowCount ?? 0} rows`);
    if (incrementalBoardStatsEnabled()) {
      console.log("INCREMENTAL_BOARD_STATS is enabled — indexer will maintain rows on new trades.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

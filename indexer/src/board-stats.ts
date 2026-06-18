import type pg from "pg";

const TOKEN_SUPPLY = 1_000_000_000;

type PgQueryable = Pick<pg.Pool, "query">;

export function incrementalBoardStatsEnabled(): boolean {
  const value = process.env.INCREMENTAL_BOARD_STATS;
  if (value === "false") return false;
  if (value === "true") return true;
  return process.env.MV_REFRESH_ENABLED === "true";
}

export type BoardStatsSeed = {
  tokenAddress: string;
  marketCapZug: string;
  spotPriceZug: string;
  reserveZug?: string;
  tokenSold?: string;
  progressBps?: number;
};

export async function seedBoardStatsOnTokenCreated(
  db: PgQueryable,
  seed: BoardStatsSeed
): Promise<void> {
  if (!incrementalBoardStatsEnabled()) return;

  const mcap = Number(seed.marketCapZug);
  const spot = Number(seed.spotPriceZug);

  await db.query(
    `
      INSERT INTO token_board_stats (
        token_address,
        market_cap_zug,
        spot_price_zug,
        ath_market_cap_zug,
        ath_price_zug,
        reserve_zug,
        token_sold,
        progress_bps,
        updated_at
      ) VALUES ($1, $2, $3, $2, $3, $4, $5, $6, now())
      ON CONFLICT (token_address) DO NOTHING
    `,
    [
      seed.tokenAddress,
      mcap,
      spot,
      seed.reserveZug ?? 0,
      seed.tokenSold ?? 0,
      seed.progressBps ?? 0,
    ]
  );
}

export type BoardStatsTradeUpdate = {
  tokenAddress: string;
  reserveZug: string;
  tokenSold: string;
  spotPriceZug: string;
  marketCapZug: string;
  progressBps: number;
  tradeCount: number;
  holderCount: number;
  tradeNetZug: string;
  blockTime: Date;
  traderAddress: string;
};

export async function upsertBoardStatsAfterTrade(
  client: pg.PoolClient,
  update: BoardStatsTradeUpdate
): Promise<void> {
  if (!incrementalBoardStatsEnabled()) return;

  const mcap = Number(update.marketCapZug);
  const spot = Number(update.spotPriceZug);
  const netVol = Number(update.tradeNetZug);
  const volAdd =
    Number.isFinite(netVol) && netVol > 0 && isWithinLast24Hours(update.blockTime)
      ? netVol
      : 0;

  const traderCount = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM trades
      WHERE token_address = $1
        AND trader_address = $2
        AND block_time >= $3::timestamptz - interval '24 hours'
    `,
    [update.tokenAddress, update.traderAddress, update.blockTime]
  );
  const traderTrades24h = Number(traderCount.rows[0]?.count ?? 0);
  const incrementTraders24h = traderTrades24h === 1 ? 1 : 0;

  await client.query(
    `
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
        traders_24h,
        updated_at
      ) VALUES (
        $1, $2, $3, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()
      )
      ON CONFLICT (token_address) DO UPDATE SET
        market_cap_zug = EXCLUDED.market_cap_zug,
        spot_price_zug = EXCLUDED.spot_price_zug,
        ath_market_cap_zug = GREATEST(
          token_board_stats.ath_market_cap_zug,
          EXCLUDED.market_cap_zug
        ),
        ath_price_zug = GREATEST(
          COALESCE(token_board_stats.ath_price_zug, 0),
          EXCLUDED.spot_price_zug
        ),
        reserve_zug = EXCLUDED.reserve_zug,
        token_sold = EXCLUDED.token_sold,
        progress_bps = EXCLUDED.progress_bps,
        trade_count = EXCLUDED.trade_count,
        holder_count = EXCLUDED.holder_count,
        volume_24h_zug = token_board_stats.volume_24h_zug + $11::numeric,
        traders_24h = token_board_stats.traders_24h + $12::integer,
        updated_at = now()
    `,
    [
      update.tokenAddress,
      mcap,
      spot,
      update.reserveZug,
      update.tokenSold,
      update.progressBps,
      update.tradeCount,
      update.holderCount,
      volAdd,
      incrementTraders24h,
      volAdd,
      incrementTraders24h,
    ]
  );
}

/** Nightly / MV reconcile: rolling 24h window fields from trades. */
export async function reconcileBoardStatsRollingWindows(pool: pg.Pool): Promise<void> {
  if (!incrementalBoardStatsEnabled()) return;

  await pool.query(`
    UPDATE token_board_stats tbs
    SET
      spot_price_zug = CASE
        WHEN (1000000000::numeric - COALESCE(b.token_sold, 0)) > 0
        THEN (5::numeric + COALESCE(b.reserve_zug, 0))
             / (1000000000::numeric - COALESCE(b.token_sold, 0))
        ELSE tbs.spot_price_zug
      END,
      market_cap_zug = CASE
        WHEN (1000000000::numeric - COALESCE(b.token_sold, 0)) > 0
        THEN ((5::numeric + COALESCE(b.reserve_zug, 0))
             / (1000000000::numeric - COALESCE(b.token_sold, 0)))
             * 1000000000
        ELSE tbs.market_cap_zug
      END,
      ath_market_cap_zug = GREATEST(
        tbs.ath_market_cap_zug,
        CASE
          WHEN (1000000000::numeric - COALESCE(b.token_sold, 0)) > 0
          THEN ((5::numeric + COALESCE(b.reserve_zug, 0))
               / (1000000000::numeric - COALESCE(b.token_sold, 0)))
               * 1000000000
          ELSE 0
        END
      ),
      reserve_zug = COALESCE(b.reserve_zug, tbs.reserve_zug),
      token_sold = COALESCE(b.token_sold, tbs.token_sold),
      progress_bps = COALESCE(b.progress_bps, tbs.progress_bps),
      trade_count = COALESCE(b.trade_count, tbs.trade_count),
      holder_count = COALESCE(b.holder_count, tbs.holder_count),
      updated_at = now()
    FROM bonding_states b
    WHERE b.token_address = tbs.token_address
  `);

  await pool.query(`
    UPDATE token_board_stats tbs
    SET
      volume_24h_zug = COALESCE(agg.volume_24h_zug, 0),
      volume_24h_prev_zug = COALESCE(agg.volume_24h_prev_zug, 0),
      trade_count_24h_ago = COALESCE(agg.trade_count_24h_ago, 0),
      traders_24h = COALESCE(agg.traders_24h, 0),
      updated_at = now()
    FROM (
      SELECT
        tr.token_address,
        COALESCE(
          SUM(GREATEST(tr.zug_amount - COALESCE(tr.fee_zug, 0), 0))
            FILTER (WHERE tr.block_time >= now() - interval '24 hours'),
          0
        ) AS volume_24h_zug,
        COALESCE(
          SUM(GREATEST(tr.zug_amount - COALESCE(tr.fee_zug, 0), 0)) FILTER (
            WHERE tr.block_time >= now() - interval '48 hours'
              AND tr.block_time < now() - interval '24 hours'
          ),
          0
        ) AS volume_24h_prev_zug,
        COUNT(*) FILTER (
          WHERE tr.block_time < now() - interval '24 hours'
        )::integer AS trade_count_24h_ago,
        COUNT(DISTINCT tr.trader_address) FILTER (
          WHERE tr.block_time >= now() - interval '24 hours'
        )::integer AS traders_24h
      FROM trades tr
      GROUP BY tr.token_address
    ) agg
    WHERE tbs.token_address = agg.token_address
  `);
}

export function marketCapZugFromSpot(spotPriceZug: string | number): string {
  const spot = Number(spotPriceZug);
  if (!Number.isFinite(spot) || spot <= 0) return "0";
  return String(spot * TOKEN_SUPPLY);
}

export async function readBoardStatsForPublish(
  db: PgQueryable,
  tokenAddress: string
): Promise<{ volume24hZug: string; traders24h: number } | null> {
  if (!incrementalBoardStatsEnabled()) return null;

  const result = await db.query<{ volume_24h_zug: string; traders_24h: number }>(
    `
      SELECT volume_24h_zug::text, traders_24h
      FROM token_board_stats
      WHERE token_address = $1
    `,
    [tokenAddress.toLowerCase()]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    volume24hZug: row.volume_24h_zug,
    traders24h: row.traders_24h,
  };
}

function isWithinLast24Hours(blockTime: Date): boolean {
  return blockTime.getTime() >= Date.now() - 24 * 60 * 60 * 1000;
}

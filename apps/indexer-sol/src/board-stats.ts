import type pg from "pg";
import { PUMP_FEEL_DEFAULTS } from "@pump/solana-sdk";
import { lamportsToSol } from "./units.js";

const TOKEN_SUPPLY = 1_000_000_000;
const VIRTUAL_SOL_HUMAN = Number(lamportsToSol(PUMP_FEEL_DEFAULTS.virtualSolLamports));

type PgQueryable = Pick<pg.Pool | pg.PoolClient, "query">;

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
    [tokenAddress]
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

export { VIRTUAL_SOL_HUMAN };

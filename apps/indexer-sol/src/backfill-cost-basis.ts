/**
 * Replay trades into remaining_cost_basis_* + realized_pnl_* (native + USD).
 *
 *   npm run backfill-cost-basis -w @pump/indexer-sol
 */
import "dotenv/config";
import pg from "pg";
import { applyTradeToPositionCost, emptyPositionCostState } from "./position-cost.js";

const pool = new pg.Pool({ connectionString: process.env.LAUNCHPAD_DATABASE_URL });

type TradeRow = {
  side: string;
  zug_amount: string;
  fee_zug: string;
  token_amount: string;
  native_usd_rate: string | null;
  block_time: Date;
  block_number: string;
  log_index: number;
};

async function replayWalletToken(
  tokenAddress: string,
  walletAddress: string
): Promise<{
  remainingCostBasis: string;
  realizedPnl: string;
  remainingCostBasisUsd: string;
  realizedPnlUsd: string;
  tokenBalance: string;
}> {
  const result = await pool.query<TradeRow>(
    `
      SELECT side, zug_amount::text, fee_zug::text, token_amount::text,
             native_usd_rate::text, block_time, block_number::text, log_index
      FROM trades
      WHERE token_address = $1 AND trader_address = $2
      ORDER BY block_time ASC, block_number ASC, log_index ASC
    `,
    [tokenAddress, walletAddress]
  );

  let state = emptyPositionCostState();

  for (const row of result.rows) {
    const isBuy = row.side === "BUY";
    const rateRaw = row.native_usd_rate != null ? Number(row.native_usd_rate) : null;
    const rate =
      rateRaw != null && Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : null;
    state = applyTradeToPositionCost(
      state,
      isBuy,
      Number(row.zug_amount),
      Number(row.fee_zug),
      Number(row.token_amount),
      rate
    );
  }

  return {
    remainingCostBasis: String(state.remainingCostBasis),
    realizedPnl: String(state.realizedPnl),
    remainingCostBasisUsd: String(state.remainingCostBasisUsd),
    realizedPnlUsd: String(state.realizedPnlUsd),
    tokenBalance: String(state.tokenBalance),
  };
}

async function main(): Promise<void> {
  const pairs = await pool.query<{ token_address: string; address: string }>(
    `SELECT DISTINCT token_address, address FROM user_positions`
  );

  let updated = 0;
  for (const { token_address, address } of pairs.rows) {
    const replayed = await replayWalletToken(token_address, address);
    await pool.query(
      `
        UPDATE user_positions
        SET remaining_cost_basis_zug = $3::numeric,
            realized_pnl_zug = $4::numeric,
            remaining_cost_basis_usd = $5::numeric,
            realized_pnl_usd = $6::numeric,
            updated_at = now()
        WHERE token_address = $1 AND address = $2
      `,
      [
        token_address,
        address,
        replayed.remainingCostBasis,
        replayed.realizedPnl,
        replayed.remainingCostBasisUsd,
        replayed.realizedPnlUsd,
      ]
    );
    updated += 1;
  }

  console.log(`backfill-cost-basis: updated ${updated} user_positions rows (native + USD)`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

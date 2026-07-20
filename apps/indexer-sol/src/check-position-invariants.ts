/**
 * Ops check: compare frozen USD cost vs native×latest trade rate (when available).
 * Exit 1 if any open position drifts beyond POSITION_COST_DRIFT_BPS (default 500 = 5%).
 *
 *   npm run check-position-invariants -w @pump/indexer-sol
 */
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.LAUNCHPAD_DATABASE_URL });
const DRIFT_BPS = Number(process.env.POSITION_COST_DRIFT_BPS ?? 500);

type Row = {
  token_address: string;
  address: string;
  token_balance: string;
  remaining_cost_basis_zug: string;
  remaining_cost_basis_usd: string;
  last_rate: string | null;
};

async function main(): Promise<void> {
  const result = await pool.query<Row>(
    `
      SELECT
        p.token_address,
        p.address,
        p.token_balance::text,
        COALESCE(p.remaining_cost_basis_zug, 0)::text AS remaining_cost_basis_zug,
        COALESCE(p.remaining_cost_basis_usd, 0)::text AS remaining_cost_basis_usd,
        (
          SELECT t.native_usd_rate::text
          FROM trades t
          WHERE t.token_address = p.token_address
            AND t.trader_address = p.address
            AND t.native_usd_rate IS NOT NULL
            AND t.native_usd_rate > 0
          ORDER BY t.block_time DESC, t.block_number DESC, t.log_index DESC
          LIMIT 1
        ) AS last_rate
      FROM user_positions p
      WHERE p.token_balance::numeric > 0
        AND COALESCE(p.remaining_cost_basis_zug, 0) > 0
    `
  );

  let violations = 0;
  for (const row of result.rows) {
    const native = Number(row.remaining_cost_basis_zug);
    const frozenUsd = Number(row.remaining_cost_basis_usd);
    const rate = row.last_rate != null ? Number(row.last_rate) : null;
    if (!(native > 0) || rate == null || !(rate > 0)) continue;

    const impliedUsd = native * rate;
    if (!(impliedUsd > 0)) continue;
    if (!(frozenUsd > 0)) {
      console.warn(
        `MISSING_USD token=${row.token_address} wallet=${row.address} native=${native}`
      );
      violations += 1;
      continue;
    }

    const driftBps = (Math.abs(frozenUsd - impliedUsd) / impliedUsd) * 10_000;
    if (driftBps > DRIFT_BPS) {
      console.warn(
        `DRIFT_BPS=${driftBps.toFixed(1)} token=${row.token_address} wallet=${row.address} ` +
          `frozenUsd=${frozenUsd} impliedUsd=${impliedUsd}`
      );
      violations += 1;
    }
  }

  console.log(
    `check-position-invariants: scanned=${result.rows.length} violations=${violations} thresholdBps=${DRIFT_BPS}`
  );
  await pool.end();
  if (violations > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

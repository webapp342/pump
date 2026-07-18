import type pg from "pg";

type PgQueryable = Pick<pg.Pool | pg.PoolClient, "query">;

export function statsRollupsEnabled(): boolean {
  const value = process.env.STATS_ROLLUPS_ENABLED;
  if (value === "false") return false;
  if (value === "true") return true;
  return process.env.INCREMENTAL_BOARD_STATS === "true" || process.env.MV_REFRESH_ENABLED === "true";
}

export type TradeStatsRollupInput = {
  traderAddress: string;
  tokenAddress: string;
  isBuy: boolean;
  zugAmount: string;
  referrerFeeZug: string;
  blockTime: Date;
  marketCapZug: string;
  launchMcapZug: string | null;
  oldBalance: number;
  newBalance: number;
};

async function fetchLaunchMcap(
  client: PgQueryable,
  tokenAddress: string
): Promise<number | null> {
  const result = await client.query<{ launch_mcap: string | null }>(
    `
      SELECT launch_mcap_zug::text AS launch_mcap
      FROM token_board_stats
      WHERE token_address = $1
    `,
    [tokenAddress]
  );
  const fromBoard = result.rows[0]?.launch_mcap;
  if (fromBoard != null && Number(fromBoard) > 0) return Number(fromBoard);

  const bonding = await client.query<{ launch_mcap: string }>(
    `
      SELECT (
        COALESCE(b.virtual_zug_reserve, 5)::numeric
        / NULLIF(COALESCE(b.virtual_token_reserve, 1000000000)::numeric, 0)
        * 1000000000::numeric
      )::text AS launch_mcap
      FROM bonding_states b
      WHERE b.token_address = $1
    `,
    [tokenAddress]
  );
  const launch = bonding.rows[0]?.launch_mcap;
  return launch != null && Number(launch) > 0 ? Number(launch) : null;
}

export async function updateTokenPeakMultiplier(
  client: PgQueryable,
  tokenAddress: string,
  marketCapZug: string,
  launchMcapZug?: string | null
): Promise<void> {
  if (!statsRollupsEnabled()) return;

  const mcap = Number(marketCapZug);
  if (!Number.isFinite(mcap) || mcap <= 0) return;

  let launch = launchMcapZug != null ? Number(launchMcapZug) : null;
  if (launch == null || !Number.isFinite(launch) || launch <= 0) {
    launch = await fetchLaunchMcap(client, tokenAddress);
  }
  if (launch == null || launch <= 0) return;

  const peakX = mcap / launch;

  await client.query(
    `
      UPDATE token_board_stats
      SET launch_mcap_zug = COALESCE(launch_mcap_zug, $2::numeric),
          peak_multiplier_x = GREATEST(COALESCE(peak_multiplier_x, 1), $3::numeric),
          updated_at = now()
      WHERE token_address = $1
    `,
    [tokenAddress, String(launch), peakX]
  );
}

export async function upsertUserTradeStatsAfterTrade(
  client: PgQueryable,
  input: Pick<TradeStatsRollupInput, "traderAddress" | "tokenAddress" | "isBuy" | "zugAmount" | "blockTime">
): Promise<void> {
  if (!statsRollupsEnabled()) return;

  const vol = Number(input.zugAmount);
  if (!Number.isFinite(vol) || vol <= 0) return;

  await client.query(
    `
      INSERT INTO user_trade_stats (
        address,
        trade_count,
        buy_count,
        sell_count,
        distinct_tokens,
        total_volume_zug,
        first_trade_at,
        last_trade_at,
        updated_at
      ) VALUES (
        $1,
        1,
        CASE WHEN $2 THEN 1 ELSE 0 END,
        CASE WHEN $2 THEN 0 ELSE 1 END,
        1,
        $3::numeric,
        $4::timestamptz,
        $4::timestamptz,
        now()
      )
      ON CONFLICT (address) DO UPDATE SET
        trade_count = user_trade_stats.trade_count + 1,
        buy_count = user_trade_stats.buy_count + CASE WHEN $2 THEN 1 ELSE 0 END,
        sell_count = user_trade_stats.sell_count + CASE WHEN $2 THEN 0 ELSE 1 END,
        distinct_tokens = (
          SELECT COUNT(DISTINCT token_address)::integer FROM trades WHERE trader_address = $1
        ),
        total_volume_zug = user_trade_stats.total_volume_zug + $3::numeric,
        first_trade_at = LEAST(user_trade_stats.first_trade_at, $4::timestamptz),
        last_trade_at = GREATEST(user_trade_stats.last_trade_at, $4::timestamptz),
        updated_at = now()
    `,
    [input.traderAddress, input.isBuy, String(vol), input.blockTime]
  );
}

export async function upsertReferrerNetworkAfterTrade(
  client: PgQueryable,
  input: Pick<TradeStatsRollupInput, "traderAddress" | "zugAmount" | "referrerFeeZug">
): Promise<void> {
  if (!statsRollupsEnabled()) return;

  const binding = await client.query<{ referrer_address: string }>(
    `
      SELECT referrer_address
      FROM referral_bindings
      WHERE invitee_address = $1
    `,
    [input.traderAddress]
  );
  const referrer = binding.rows[0]?.referrer_address;
  if (!referrer) return;

  const vol = Number(input.zugAmount);
  const fee = Number(input.referrerFeeZug);
  if (!Number.isFinite(vol) || vol <= 0) return;

  await client.query(
    `
      INSERT INTO referrer_network_stats (
        referrer_address,
        qualified_invite_count,
        network_volume_zug,
        network_fee_earned_zug,
        avg_volume_per_invitee,
        updated_at
      )
      SELECT
        $1,
        COUNT(*)::integer,
        $2::numeric,
        $3::numeric,
        CASE WHEN COUNT(*) > 0 THEN $2::numeric / COUNT(*) ELSE 0 END,
        now()
      FROM referral_bindings
      WHERE referrer_address = $1
      ON CONFLICT (referrer_address) DO UPDATE SET
        network_volume_zug = referrer_network_stats.network_volume_zug + $2::numeric,
        network_fee_earned_zug = referrer_network_stats.network_fee_earned_zug + $3::numeric,
        qualified_invite_count = (
          SELECT COUNT(*)::integer FROM referral_bindings WHERE referrer_address = $1
        ),
        avg_volume_per_invitee = (
          SELECT CASE WHEN COUNT(*) > 0
            THEN (referrer_network_stats.network_volume_zug + $2::numeric) / COUNT(*)
            ELSE 0 END
          FROM referral_bindings WHERE referrer_address = $1
        ),
        repeat_trader_count = (
          SELECT COUNT(*)::integer
          FROM referral_bindings rb
          INNER JOIN user_trade_stats uts ON uts.address = rb.invitee_address
          WHERE rb.referrer_address = $1 AND uts.trade_count >= 2
        ),
        repeat_trader_rate = (
          SELECT CASE WHEN COUNT(*) > 0
            THEN (
              SELECT COUNT(*)::numeric
              FROM referral_bindings rb
              INNER JOIN user_trade_stats uts ON uts.address = rb.invitee_address
              WHERE rb.referrer_address = $1 AND uts.trade_count >= 2
            ) / COUNT(*)
            ELSE 0 END
          FROM referral_bindings WHERE referrer_address = $1
        ),
        updated_at = now()
    `,
    [referrer, String(vol), String(Number.isFinite(fee) ? fee : 0)]
  );
}

export async function updateHoldStatsAfterTrade(
  client: PgQueryable,
  input: Pick<
    TradeStatsRollupInput,
    "traderAddress" | "tokenAddress" | "isBuy" | "blockTime" | "marketCapZug" | "oldBalance" | "newBalance"
  >
): Promise<void> {
  if (!statsRollupsEnabled()) return;

  const mcap = Number(input.marketCapZug);
  const launch = await fetchLaunchMcap(client, input.tokenAddress);
  const peakX =
    launch != null && launch > 0 && Number.isFinite(mcap) ? mcap / launch : null;

  if (input.isBuy && input.oldBalance <= 0 && input.newBalance > 0) {
    await client.query(
      `
        INSERT INTO user_position_lots (
          token_address,
          address,
          opened_at,
          entry_mcap_zug,
          peak_multiplier_x
        ) VALUES ($1, $2, $3, $4::numeric, $5::numeric)
      `,
      [
        input.tokenAddress,
        input.traderAddress,
        input.blockTime,
        Number.isFinite(mcap) ? String(mcap) : null,
        peakX != null && Number.isFinite(peakX) ? peakX : 1,
      ]
    );
    return;
  }

  if (input.newBalance > 0 && peakX != null && Number.isFinite(peakX)) {
    await client.query(
      `
        UPDATE user_position_lots
        SET peak_multiplier_x = GREATEST(peak_multiplier_x, $4::numeric)
        WHERE token_address = $1
          AND address = $2
          AND closed_at IS NULL
      `,
      [input.tokenAddress, input.traderAddress, input.blockTime, peakX]
    );
    return;
  }

  if (input.oldBalance > 0 && input.newBalance <= 0) {
    const closed = await client.query<{ opened_at: Date }>(
      `
        UPDATE user_position_lots
        SET closed_at = $3,
            hold_seconds = EXTRACT(EPOCH FROM ($3::timestamptz - opened_at))::bigint
        WHERE token_address = $1
          AND address = $2
          AND closed_at IS NULL
        RETURNING opened_at
      `,
      [input.tokenAddress, input.traderAddress, input.blockTime]
    );

    const holdSeconds = closed.rows.reduce((sum, row) => {
      return sum + Math.max(0, Math.floor((input.blockTime.getTime() - row.opened_at.getTime()) / 1000));
    }, 0);

    if (holdSeconds <= 0) return;

    await client.query(
      `
        INSERT INTO user_hold_stats (
          address,
          closed_lot_count,
          total_hold_seconds,
          avg_hold_seconds,
          updated_at
        ) VALUES ($1, 1, $2::bigint, $2::numeric, now())
        ON CONFLICT (address) DO UPDATE SET
          closed_lot_count = user_hold_stats.closed_lot_count + 1,
          total_hold_seconds = user_hold_stats.total_hold_seconds + $2::bigint,
          avg_hold_seconds = (
            user_hold_stats.total_hold_seconds + $2::bigint
          )::numeric / (user_hold_stats.closed_lot_count + 1),
          updated_at = now()
      `,
      [input.traderAddress, holdSeconds]
    );
  }
}

export async function applyTradeStatsRollups(
  client: pg.PoolClient,
  input: TradeStatsRollupInput
): Promise<void> {
  if (!statsRollupsEnabled()) return;

  await upsertUserTradeStatsAfterTrade(client, input);
  await upsertReferrerNetworkAfterTrade(client, input);
  await updateTokenPeakMultiplier(client, input.tokenAddress, input.marketCapZug, input.launchMcapZug);
  await updateHoldStatsAfterTrade(client, input);
}

export async function seedBoardStatsLaunchMcap(
  client: PgQueryable,
  tokenAddress: string,
  launchMcapZug: string
): Promise<void> {
  if (!statsRollupsEnabled()) return;
  await client.query(
    `
      UPDATE token_board_stats
      SET launch_mcap_zug = COALESCE(launch_mcap_zug, $2::numeric),
          peak_multiplier_x = GREATEST(COALESCE(peak_multiplier_x, 1), 1),
          updated_at = now()
      WHERE token_address = $1
    `,
    [tokenAddress, launchMcapZug]
  );
}

export async function refreshReferrerNetworkOnBind(
  pool: PgQueryable,
  referrerAddress: string
): Promise<void> {
  if (!statsRollupsEnabled()) return;

  await pool.query(
    `
      INSERT INTO referrer_network_stats (
        referrer_address,
        qualified_invite_count,
        updated_at
      ) VALUES ($1, 1, now())
      ON CONFLICT (referrer_address) DO UPDATE SET
        qualified_invite_count = (
          SELECT COUNT(*)::integer FROM referral_bindings WHERE referrer_address = $1
        ),
        updated_at = now()
    `,
    [referrerAddress]
  );
}

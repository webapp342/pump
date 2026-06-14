import { getLaunchpadPool } from "@/lib/db/launchpad";

export type AdminDbStats = {
  usersRegistered: number;
  usersRegistered24h: number;
  usersTraded: number;
  totalTrades: number;
  trades24h: number;
  totalTokens: number;
  tokensToday: number;
  totalAirdrops: number;
  airdropsToday: number;
  treasuryShareFromTradesBnb: string;
  creatorAllocatedBnb: string;
  referrerAllocatedBnb: string;
  claimedCreatorBnb: string;
  claimedReferrerBnb: string;
  pendingCreatorBnb: string;
  pendingReferrerBnb: string;
  claimedTotalBnb: string;
};

function rowNum(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function decMax(a: string, b: string): string {
  const diff = rowNum(a) - rowNum(b);
  return diff > 0 ? String(diff) : "0";
}

export async function getAdminDbStats(): Promise<AdminDbStats> {
  const pool = getLaunchpadPool();
  const result = await pool.query<{
    users_registered: number;
    users_registered_24h: number;
    users_traded: number;
    total_trades: number;
    trades_24h: number;
    total_tokens: number;
    tokens_today: number;
    total_airdrops: number;
    airdrops_today: number;
    treasury_share_from_trades: string;
    creator_allocated: string;
    referrer_allocated: string;
    claimed_creator: string;
    claimed_referrer: string;
  }>(
    `
      SELECT
        (SELECT COUNT(*)::int FROM users) AS users_registered,
        (
          SELECT COUNT(*)::int FROM users
          WHERE created_at >= now() - interval '24 hours'
        ) AS users_registered_24h,
        (SELECT COUNT(*)::int FROM user_volumes) AS users_traded,
        (SELECT COUNT(*)::int FROM trades) AS total_trades,
        (SELECT COUNT(*)::int FROM trades WHERE block_time >= now() - interval '24 hours') AS trades_24h,
        (SELECT COUNT(*)::int FROM tokens) AS total_tokens,
        (
          SELECT COUNT(*)::int FROM tokens
          WHERE created_at >= date_trunc('day', timezone('UTC', now()))
        ) AS tokens_today,
        (SELECT COUNT(*)::int FROM airdrops WHERE on_chain_id IS NOT NULL) AS total_airdrops,
        (
          SELECT COUNT(*)::int FROM airdrops
          WHERE on_chain_id IS NOT NULL
            AND created_at >= date_trunc('day', timezone('UTC', now()))
        ) AS airdrops_today,
        COALESCE((SELECT SUM(treasury_fee_zug) FROM trades), 0)::text AS treasury_share_from_trades,
        COALESCE((SELECT SUM(creator_fee_zug) FROM trades), 0)::text AS creator_allocated,
        COALESCE((SELECT SUM(referrer_fee_zug) FROM trades), 0)::text AS referrer_allocated,
        COALESCE((SELECT SUM(amount_bnb) FROM creator_fee_claims), 0)::text AS claimed_creator,
        COALESCE((SELECT SUM(amount_bnb) FROM referrer_fee_claims), 0)::text AS claimed_referrer
    `
  );

  const row = result.rows[0];
  if (!row) {
    return {
      usersRegistered: 0,
      usersRegistered24h: 0,
      usersTraded: 0,
      totalTrades: 0,
      trades24h: 0,
      totalTokens: 0,
      tokensToday: 0,
      totalAirdrops: 0,
      airdropsToday: 0,
      treasuryShareFromTradesBnb: "0",
      creatorAllocatedBnb: "0",
      referrerAllocatedBnb: "0",
      claimedCreatorBnb: "0",
      claimedReferrerBnb: "0",
      pendingCreatorBnb: "0",
      pendingReferrerBnb: "0",
      claimedTotalBnb: "0",
    };
  }

  const claimedCreatorBnb = row.claimed_creator;
  const claimedReferrerBnb = row.claimed_referrer;
  const pendingCreatorBnb = decMax(row.creator_allocated, claimedCreatorBnb);
  const pendingReferrerBnb = decMax(row.referrer_allocated, claimedReferrerBnb);
  const claimedTotalBnb = String(rowNum(claimedCreatorBnb) + rowNum(claimedReferrerBnb));

  return {
    usersRegistered: row.users_registered,
    usersRegistered24h: row.users_registered_24h,
    usersTraded: row.users_traded,
    totalTrades: row.total_trades,
    trades24h: row.trades_24h,
    totalTokens: row.total_tokens,
    tokensToday: row.tokens_today,
    totalAirdrops: row.total_airdrops,
    airdropsToday: row.airdrops_today,
    treasuryShareFromTradesBnb: row.treasury_share_from_trades,
    creatorAllocatedBnb: row.creator_allocated,
    referrerAllocatedBnb: row.referrer_allocated,
    claimedCreatorBnb,
    claimedReferrerBnb,
    pendingCreatorBnb,
    pendingReferrerBnb,
    claimedTotalBnb,
  };
}

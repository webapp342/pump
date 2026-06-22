import type { AirdropRules } from "@/lib/airdrop-rules";
import { getLaunchpadPool } from "@/lib/db/launchpad";
import { sqlBondingMarkPrice } from "@/lib/db/bonding-mark-price-sql";

export type AdminAirdropRow = {
  id: string;
  onChainId: string;
  title: string | null;
  linkedSymbol: string | null;
  rewardToken: string | null;
  rewardSymbol: string | null;
  rewardPriceBnb: string | null;
  totalFunded: string;
  status: string;
  merkleRoot: string | null;
  claimEnd: string;
};

export async function listAdminAirdrops(): Promise<AdminAirdropRow[]> {
  const pool = getLaunchpadPool();
  const result = await pool.query<{
    id: string;
    on_chain_id: string;
    rules_json: AirdropRules;
    reward_token: string | null;
    total_funded: string;
    status: string;
    merkle_root: string | null;
    claim_end: Date | null;
    symbol: string | null;
    reward_symbol: string | null;
    reward_price_bnb: string | null;
  }>(
    `
      SELECT a.id, a.on_chain_id, a.rules_json, a.reward_token, a.total_funded,
             a.status, a.merkle_root, a.claim_end, t.symbol,
             rt.symbol AS reward_symbol,
             COALESCE((${sqlBondingMarkPrice("rb")}), 0)::text AS reward_price_bnb
      FROM airdrops a
      LEFT JOIN tokens t ON t.address = a.linked_token
      LEFT JOIN tokens rt ON rt.address = a.reward_token
      LEFT JOIN bonding_states rb ON rb.token_address = a.reward_token
      WHERE a.on_chain_id IS NOT NULL
      ORDER BY a.claim_end DESC NULLS LAST, a.id DESC
    `
  );

  return result.rows.map((row) => ({
    id: row.id,
    onChainId: row.on_chain_id,
    title: row.rules_json?.title ?? null,
    linkedSymbol: row.symbol,
    rewardToken: row.reward_token,
    rewardSymbol: row.reward_symbol,
    rewardPriceBnb: row.reward_price_bnb,
    totalFunded: row.total_funded,
    status: row.status,
    merkleRoot: row.merkle_root,
    claimEnd: row.claim_end?.toISOString() ?? "",
  }));
}

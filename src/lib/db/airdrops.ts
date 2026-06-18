import type { AirdropRules, AirdropSocialTaskInput } from "@/lib/airdrop-rules";
import { fetchLiveTokenBalance, fetchLiveTokenBalances } from "@/lib/airdrop-onchain";
import {
  computeParticipantProgress,
  deriveAirdropNextAction,
  type AirdropNextAction,
} from "@/lib/airdrop-participant-snapshot";
import { getAirdropDisplayStatus, type AirdropDisplayStatus } from "@/lib/airdrop-status";
import { getLaunchpadPool } from "@/lib/db/launchpad";

export type AirdropListItem = {
  id: string;
  onChainId: string | null;
  creatorAddress: string;
  linkedToken: string;
  rewardToken: string | null;
  totalFunded: string;
  title: string | null;
  status: string;
  qualifyStart: string;
  qualifyEnd: string;
  claimEnd: string | null;
  linkedSymbol: string | null;
  linkedName: string | null;
  /** Last bonding-curve price in BNB per pool token. */
  linkedPriceBnb: string | null;
  rewardSymbol: string | null;
  rewardName: string | null;
  /** Last bonding-curve price in BNB per token (DB column legacy name: last_price_zug). */
  rewardPriceBnb: string | null;
};

export type AirdropSocialTask = {
  id: string;
  taskType: string;
  targetUrl: string;
  isRequired: boolean;
  sortOrder: number;
  completed?: boolean;
};

export type AirdropDetail = AirdropListItem & {
  description: string | null;
  rulesHash: string;
  merkleRoot: string | null;
  totalAllocated: string | null;
  claimStart: string | null;
  createTxHash: string;
  participantCount: number;
  rules: AirdropRules;
  socialTasks: AirdropSocialTask[];
};

export type LeaderboardRow = {
  address: string;
  holdAmount: string;
  buyVolumeBnb: string;
  rank: number;
};

export type LeaderboardViewer = {
  rank: number | null;
  holdAmount: string;
  buyVolumeBnb: string;
  qualified: boolean;
  inTop100: boolean;
};

export type AirdropLeaderboardResult = {
  rows: LeaderboardRow[];
  viewer: LeaderboardViewer | null;
};

export type WinnerRow = {
  address: string;
  rank: number;
  amount: string;
  claimed: boolean;
};

export type AirdropRuleProgress = {
  current: string;
  target: string;
  met: boolean;
};

export type AirdropProgress = {
  address: string;
  socialTasksTotal: number;
  socialTasksCompleted: number;
  socialGatePassed: boolean;
  onchainUnlocked: boolean;
  minHold?: AirdropRuleProgress;
  minBuy?: AirdropRuleProgress;
  onchainQualified: boolean;
};

export async function listAirdrops(): Promise<AirdropListItem[]> {
  const pool = getLaunchpadPool();
  const result = await pool.query<{
    id: string;
    on_chain_id: string | null;
    creator_address: string;
    linked_token: string;
    reward_token: string | null;
    total_funded: string;
    rules_json: AirdropRules;
    status: string;
    qualify_start: Date;
    qualify_end: Date;
    claim_end: Date | null;
    symbol: string | null;
    name: string | null;
    reward_symbol: string | null;
    reward_name: string | null;
    linked_price_bnb: string | null;
    reward_price_bnb: string | null;
  }>(
    `
      SELECT a.id, a.on_chain_id, a.creator_address, a.linked_token, a.reward_token,
             a.total_funded, a.rules_json, a.status, a.qualify_start, a.qualify_end, a.claim_end,
             t.symbol, t.name,
             rt.symbol AS reward_symbol, rt.name AS reward_name,
             COALESCE(lb.last_price_zug, 0)::text AS linked_price_bnb,
             COALESCE(rb.last_price_zug, 0)::text AS reward_price_bnb
      FROM airdrops a
      LEFT JOIN tokens t ON t.address = a.linked_token
      LEFT JOIN tokens rt ON rt.address = a.reward_token
      LEFT JOIN bonding_states lb ON lb.token_address = a.linked_token
      LEFT JOIN bonding_states rb ON rb.token_address = a.reward_token
      ORDER BY
        CASE a.status WHEN 'CLOSED' THEN 1 ELSE 0 END,
        a.qualify_end DESC
    `,
    []
  );

  return result.rows.map((row) => ({
    id: row.id,
    onChainId: row.on_chain_id,
    creatorAddress: row.creator_address,
    linkedToken: row.linked_token,
    rewardToken: row.reward_token,
    totalFunded: row.total_funded,
    title: row.rules_json?.title ?? null,
    status: row.status,
    qualifyStart: row.qualify_start.toISOString(),
    qualifyEnd: row.qualify_end.toISOString(),
    claimEnd: row.claim_end?.toISOString() ?? null,
    linkedSymbol: row.symbol,
    linkedName: row.name,
    linkedPriceBnb: row.linked_price_bnb,
    rewardSymbol: row.reward_symbol,
    rewardName: row.reward_name,
    rewardPriceBnb: row.reward_price_bnb,
  }));
}

export async function getAirdropById(id: string, viewerAddress?: string): Promise<AirdropDetail | null> {
  const pool = getLaunchpadPool();
  const result = await pool.query<{
    id: string;
    on_chain_id: string | null;
    creator_address: string;
    linked_token: string;
    reward_token: string | null;
    total_funded: string;
    total_allocated: string | null;
    rules_json: AirdropRules;
    rules_hash: string;
    qualify_start: Date;
    qualify_end: Date;
    claim_start: Date | null;
    claim_end: Date | null;
    merkle_root: string | null;
    status: string;
    create_tx_hash: string;
    symbol: string | null;
    name: string | null;
    reward_symbol: string | null;
    reward_name: string | null;
    linked_price_bnb: string | null;
    reward_price_bnb: string | null;
    participant_count: number;
  }>(
    `
      SELECT a.*, t.symbol, t.name,
             rt.symbol AS reward_symbol, rt.name AS reward_name,
             COALESCE(lb.last_price_zug, 0)::text AS linked_price_bnb,
             COALESCE(rb.last_price_zug, 0)::text AS reward_price_bnb,
             (SELECT COUNT(*)::int FROM airdrop_participants ap WHERE ap.airdrop_id = a.id) AS participant_count
      FROM airdrops a
      LEFT JOIN tokens t ON t.address = a.linked_token
      LEFT JOIN tokens rt ON rt.address = a.reward_token
      LEFT JOIN bonding_states lb ON lb.token_address = a.linked_token
      LEFT JOIN bonding_states rb ON rb.token_address = a.reward_token
      WHERE a.id = $1::bigint
      LIMIT 1
    `,
    [id]
  );

  const row = result.rows[0];
  if (!row) return null;

  const tasks = await pool.query<{
    id: string;
    task_type: string;
    target_url: string;
    is_required: boolean;
    sort_order: number;
    completed: boolean | null;
  }>(
    `
      SELECT st.id, st.task_type, st.target_url, st.is_required, st.sort_order,
             ($2::text IS NOT NULL AND tc.id IS NOT NULL) AS completed
      FROM airdrop_social_tasks st
      LEFT JOIN airdrop_task_completions tc
        ON tc.task_id = st.id
       AND tc.airdrop_id = st.airdrop_id
       AND tc.address = $2
      WHERE st.airdrop_id = $1
      ORDER BY st.sort_order ASC, st.id ASC
    `,
    [row.id, viewerAddress?.toLowerCase() ?? null]
  );

  return {
    id: row.id,
    onChainId: row.on_chain_id,
    creatorAddress: row.creator_address,
    linkedToken: row.linked_token,
    rewardToken: row.reward_token,
    totalFunded: row.total_funded,
    totalAllocated: row.total_allocated,
    title: row.rules_json?.title ?? null,
    description: row.rules_json?.description ?? null,
    status: row.status,
    qualifyStart: row.qualify_start.toISOString(),
    qualifyEnd: row.qualify_end.toISOString(),
    claimStart: row.claim_start?.toISOString() ?? null,
    claimEnd: row.claim_end?.toISOString() ?? null,
    merkleRoot: row.merkle_root,
    rulesHash: row.rules_hash,
    createTxHash: row.create_tx_hash,
    linkedSymbol: row.symbol,
    linkedName: row.name,
    linkedPriceBnb: row.linked_price_bnb,
    rewardSymbol: row.reward_symbol,
    rewardName: row.reward_name,
    rewardPriceBnb: row.reward_price_bnb,
    participantCount: row.participant_count ?? 0,
    rules: row.rules_json ?? {},
    socialTasks: tasks.rows.map((task) => ({
      id: task.id,
      taskType: task.task_type,
      targetUrl: task.target_url,
      isRequired: task.is_required,
      sortOrder: task.sort_order,
      completed: Boolean(task.completed),
    })),
  };
}

export async function syncAirdropMetadata(input: {
  onChainId: string;
  creatorAddress: string;
  createTxHash: string;
  linkedToken: string;
  rewardToken: string | null;
  totalFunded: string;
  qualifyStart: string;
  qualifyEnd: string;
  claimStart: string;
  claimEnd: string;
  rules: AirdropRules;
  rulesHash: string;
  socialTasks: AirdropSocialTaskInput[];
}): Promise<string> {
  const pool = getLaunchpadPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const upserted = await client.query<{ id: string }>(
      `
        INSERT INTO airdrops (
          on_chain_id, creator_address, linked_token, reward_token, total_funded,
          rules_json, rules_hash, qualify_start, qualify_end, claim_start, claim_end,
          status, create_tx_hash
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, 'ACTIVE', $12)
        ON CONFLICT (on_chain_id) DO UPDATE
        SET rules_json = EXCLUDED.rules_json,
            rules_hash = EXCLUDED.rules_hash,
            creator_address = EXCLUDED.creator_address,
            linked_token = EXCLUDED.linked_token,
            reward_token = EXCLUDED.reward_token,
            total_funded = EXCLUDED.total_funded,
            qualify_start = EXCLUDED.qualify_start,
            qualify_end = EXCLUDED.qualify_end,
            claim_start = EXCLUDED.claim_start,
            claim_end = EXCLUDED.claim_end,
            create_tx_hash = EXCLUDED.create_tx_hash,
            updated_at = now()
        RETURNING id
      `,
      [
        input.onChainId,
        input.creatorAddress.toLowerCase(),
        input.linkedToken.toLowerCase(),
        input.rewardToken?.toLowerCase() ?? null,
        input.totalFunded,
        JSON.stringify(input.rules),
        input.rulesHash.toLowerCase(),
        input.qualifyStart,
        input.qualifyEnd,
        input.claimStart,
        input.claimEnd,
        input.createTxHash.toLowerCase(),
      ]
    );

    const airdropId = upserted.rows[0]?.id;

    if (!airdropId) {
      throw new Error("Failed to sync airdrop metadata");
    }

    await client.query("DELETE FROM airdrop_social_tasks WHERE airdrop_id = $1", [airdropId]);

    for (const [index, task] of input.socialTasks.entries()) {
      await client.query(
        `
          INSERT INTO airdrop_social_tasks (
            airdrop_id, task_type, target_url, is_required, sort_order
          ) VALUES ($1, $2, $3, $4, $5)
        `,
        [
          airdropId,
          task.taskType,
          task.targetUrl,
          task.isRequired ?? true,
          task.sortOrder ?? index,
        ]
      );
    }

    await client.query("COMMIT");
    return airdropId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeSocialTask(
  airdropId: string,
  taskId: string,
  address: string
): Promise<void> {
  const pool = getLaunchpadPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const airdrop = await client.query<{ qualify_end: Date }>(
      "SELECT qualify_end FROM airdrops WHERE id = $1::bigint",
      [airdropId]
    );
    if (!airdrop.rows[0]) throw new Error("Airdrop not found");
    if (airdrop.rows[0].qualify_end <= new Date()) {
      throw new Error("Qualification period ended");
    }

    await client.query(
      `
        INSERT INTO airdrop_task_completions (airdrop_id, task_id, address)
        VALUES ($1, $2, $3)
        ON CONFLICT (airdrop_id, task_id, address) DO NOTHING
      `,
      [airdropId, taskId, address.toLowerCase()]
    );

    const required = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count FROM airdrop_social_tasks
        WHERE airdrop_id = $1 AND is_required = true
      `,
      [airdropId]
    );
    const done = await client.query<{ count: string }>(
      `
        SELECT COUNT(DISTINCT c.task_id)::text AS count
        FROM airdrop_task_completions c
        JOIN airdrop_social_tasks t ON t.id = c.task_id
        WHERE c.airdrop_id = $1 AND c.address = $2 AND t.is_required = true
      `,
      [airdropId, address.toLowerCase()]
    );

    if (Number(required.rows[0]?.count ?? 0) > 0 && Number(done.rows[0]?.count ?? 0) >= Number(required.rows[0]?.count ?? 0)) {
      await client.query(
        `
          INSERT INTO airdrop_participants (airdrop_id, address, social_gate_passed_at, updated_at)
          VALUES ($1, $2, now(), now())
          ON CONFLICT (airdrop_id, address) DO UPDATE
          SET social_gate_passed_at = COALESCE(airdrop_participants.social_gate_passed_at, now()),
              updated_at = now()
        `,
        [airdropId, address.toLowerCase()]
      );
    }

    await client.query("COMMIT");

    await refreshParticipantSnapshot(airdropId, address).catch(() => {
      /* snapshot is best-effort */
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAirdropProgress(airdropId: string, address: string): Promise<AirdropProgress | null> {
  const airdrop = await getAirdropById(airdropId, address);
  if (!airdrop) return null;

  const pool = getLaunchpadPool();
  const normalized = address.toLowerCase();

  const requiredTasks = airdrop.socialTasks.filter((t) => t.isRequired);
  const socialTasksTotal = requiredTasks.length;
  const socialTasksCompleted = requiredTasks.filter((t) => t.completed).length;

  const participant = await pool.query<{ social_gate_passed_at: Date | null }>(
    `SELECT social_gate_passed_at FROM airdrop_participants WHERE airdrop_id = $1::bigint AND address = $2`,
    [airdrop.id, normalized]
  );

  const socialGatePassed =
    socialTasksTotal === 0 ||
    socialTasksCompleted >= socialTasksTotal ||
    participant.rows[0]?.social_gate_passed_at != null;

  const onchainUnlocked = socialGatePassed;
  const minHoldWei = airdrop.rules.onchain?.minHoldWei;
  const minBuyBnbWei = airdrop.rules.onchain?.minBuyBnbWei;

  let minHold: AirdropRuleProgress | undefined;
  let minBuy: AirdropRuleProgress | undefined;

  if (onchainUnlocked) {
    if (minHoldWei && minHoldWei !== "0") {
      const holdTarget = weiStringToDecimal(minHoldWei);
      const current = await fetchLiveTokenBalance(airdrop.linkedToken, normalized);
      minHold = {
        current,
        target: holdTarget,
        met: Number(current) >= Number(holdTarget),
      };
    }

    if (minBuyBnbWei && minBuyBnbWei !== "0") {
      const buyTarget = weiStringToDecimal(minBuyBnbWei);
      const buyResult = await pool.query<{ buy_volume: string }>(
        `
          SELECT COALESCE(SUM(zug_amount), 0)::text AS buy_volume
          FROM trades
          WHERE token_address = $1
            AND trader_address = $2
            AND side = 'BUY'
            AND block_time >= $3::timestamptz
            AND block_time <= $4::timestamptz
        `,
        [airdrop.linkedToken, normalized, airdrop.qualifyStart, airdrop.qualifyEnd]
      );
      const current = buyResult.rows[0]?.buy_volume ?? "0";
      minBuy = {
        current,
        target: buyTarget,
        met: Number(current) >= Number(buyTarget),
      };
    }
  }

  const holdOk = !minHold || minHold.met;
  const buyOk = !minBuy || minBuy.met;
  const hasOnchainRule = Boolean(minHold || minBuy);

  return {
    address: normalized,
    socialTasksTotal,
    socialTasksCompleted,
    socialGatePassed,
    onchainUnlocked,
    minHold,
    minBuy,
    onchainQualified: onchainUnlocked && hasOnchainRule && holdOk && buyOk,
  };
}

export async function getAirdropLeaderboard(
  airdropId: string,
  opts?: { limit?: number; viewerAddress?: string | null }
): Promise<AirdropLeaderboardResult> {
  const limit = opts?.limit ?? 100;
  const pool = getLaunchpadPool();
  const airdrop = await getAirdropById(airdropId);
  if (!airdrop) return { rows: [], viewer: null };

  const minHold = airdrop.rules.onchain?.minHoldWei ?? "0";
  const minBuy = airdrop.rules.onchain?.minBuyBnbWei ?? "0";

  const candidates = await pool.query<{
    address: string;
    buy_volume_bnb: string;
  }>(
    `
      WITH buy_volume AS (
        SELECT trader_address AS address, COALESCE(SUM(zug_amount), 0) AS buy_volume_bnb
        FROM trades
        WHERE token_address = $1
          AND side = 'BUY'
          AND block_time >= $2::timestamptz
          AND block_time <= $3::timestamptz
        GROUP BY trader_address
      ),
      holder_candidates AS (
        SELECT address FROM user_positions
        WHERE token_address = $1 AND token_balance > 0
        UNION
        SELECT address FROM buy_volume
      )
      SELECT LOWER(h.address) AS address,
             COALESCE(b.buy_volume_bnb, 0)::text AS buy_volume_bnb
      FROM holder_candidates h
      LEFT JOIN buy_volume b ON LOWER(b.address) = LOWER(h.address)
    `,
    [airdrop.linkedToken, airdrop.qualifyStart, airdrop.qualifyEnd]
  );

  const minHoldDecimal = weiStringToDecimal(minHold);
  const minBuyDecimal = weiStringToDecimal(minBuy);
  const liveBalances = await fetchLiveTokenBalances(
    airdrop.linkedToken,
    candidates.rows.map((row) => row.address)
  );

  const scored = candidates.rows.map((row) => {
    const holdAmount = liveBalances.get(row.address.toLowerCase()) ?? "0";
    const holdOk = minHoldDecimal === "0" || Number(holdAmount) >= Number(minHoldDecimal);
    const buyOk = minBuyDecimal === "0" || Number(row.buy_volume_bnb) >= Number(minBuyDecimal);
    return {
      address: row.address,
      holdAmount,
      buyVolumeBnb: row.buy_volume_bnb,
      qualified: holdOk && buyOk,
    };
  });

  const ranked = scored
    .filter((row) => row.qualified)
    .sort((a, b) => {
      const holdDiff = Number(b.holdAmount) - Number(a.holdAmount);
      if (holdDiff !== 0) return holdDiff;
      return Number(b.buyVolumeBnb) - Number(a.buyVolumeBnb);
    });

  let viewer: LeaderboardViewer | null = null;
  const viewerAddress = opts?.viewerAddress?.toLowerCase() ?? null;
  if (viewerAddress) {
    const viewerIndex = ranked.findIndex((row) => row.address.toLowerCase() === viewerAddress);
    const viewerCandidate = scored.find((row) => row.address.toLowerCase() === viewerAddress);
    if (viewerIndex >= 0) {
      const row = ranked[viewerIndex]!;
      viewer = {
        rank: viewerIndex + 1,
        holdAmount: row.holdAmount,
        buyVolumeBnb: row.buyVolumeBnb,
        qualified: true,
        inTop100: viewerIndex < limit,
      };
    } else if (viewerCandidate) {
      viewer = {
        rank: null,
        holdAmount: viewerCandidate.holdAmount,
        buyVolumeBnb: viewerCandidate.buyVolumeBnb,
        qualified: viewerCandidate.qualified,
        inTop100: false,
      };
    }
  }

  return {
    rows: ranked.slice(0, limit).map((row, index) => ({
      address: row.address,
      holdAmount: row.holdAmount,
      buyVolumeBnb: row.buyVolumeBnb,
      rank: index + 1,
    })),
    viewer,
  };
}

export async function getAirdropWinners(airdropId: string): Promise<WinnerRow[]> {
  const pool = getLaunchpadPool();
  const result = await pool.query<{
    address: string;
    rank: number;
    amount: string;
    claimed: boolean;
  }>(
    `
      SELECT aa.address, aa.rank, aa.amount::text,
             (ac.id IS NOT NULL) AS claimed
      FROM airdrop_allocations aa
      LEFT JOIN airdrop_claims ac
        ON ac.airdrop_id = aa.airdrop_id AND ac.claimant = aa.address
      WHERE aa.airdrop_id = $1::bigint
      ORDER BY aa.rank ASC
    `,
    [airdropId]
  );

  return result.rows.map((row) => ({
    address: row.address,
    rank: row.rank,
    amount: row.amount,
    claimed: row.claimed,
  }));
}

export async function getAirdropProof(
  airdropId: string,
  address: string
): Promise<{ amount: string; proof: string[] } | null> {
  const pool = getLaunchpadPool();
  const result = await pool.query<{ amount: string; proof_path: string[] | null }>(
    `
      SELECT aa.amount::text, aa.proof_path
      FROM airdrop_allocations aa
      LEFT JOIN airdrop_claims ac
        ON ac.airdrop_id = aa.airdrop_id AND ac.claimant = aa.address
      WHERE aa.airdrop_id = $1::bigint
        AND aa.address = $2
        AND ac.id IS NULL
    `,
    [airdropId, address.toLowerCase()]
  );

  const row = result.rows[0];
  if (!row?.proof_path) return null;
  return { amount: row.amount, proof: row.proof_path };
}

export type MyAirdropParticipation = {
  id: string;
  onChainId: string | null;
  title: string | null;
  linkedToken: string;
  linkedSymbol: string | null;
  linkedName: string | null;
  rewardToken: string | null;
  rewardSymbol: string | null;
  rewardPriceBnb: string | null;
  totalFunded: string;
  status: string;
  qualifyStart: string;
  qualifyEnd: string;
  claimEnd: string | null;
  merkleRoot: string | null;
  displayStatus: AirdropDisplayStatus;
  socialTasksTotal: number;
  socialTasksCompleted: number;
  holdMet: boolean;
  buyMet: boolean;
  onchainQualified: boolean;
  progressPct: number;
  viewerRank: number | null;
  claimableAmount: string | null;
  claimedAt: string | null;
  nextAction: AirdropNextAction;
};

async function queryParticipantHoldAndBuy(
  linkedToken: string,
  address: string,
  qualifyStart: string,
  qualifyEnd: string
): Promise<{ holdCurrent: number; buyCurrent: number }> {
  const pool = getLaunchpadPool();
  const normalized = address.toLowerCase();

  const [holdResult, buyResult] = await Promise.all([
    pool.query<{ token_balance: string }>(
      `
        SELECT COALESCE(token_balance, 0)::text AS token_balance
        FROM user_positions
        WHERE token_address = $1 AND address = $2
      `,
      [linkedToken, normalized]
    ),
    pool.query<{ buy_volume: string }>(
      `
        SELECT COALESCE(SUM(zug_amount), 0)::text AS buy_volume
        FROM trades
        WHERE token_address = $1
          AND trader_address = $2
          AND side = 'BUY'
          AND block_time >= $3::timestamptz
          AND block_time <= $4::timestamptz
      `,
      [linkedToken, normalized, qualifyStart, qualifyEnd]
    ),
  ]);

  return {
    holdCurrent: Number(holdResult.rows[0]?.token_balance ?? 0),
    buyCurrent: Number(buyResult.rows[0]?.buy_volume ?? 0),
  };
}

/** Recompute and persist materialized progress for one wallet + campaign. */
export async function refreshParticipantSnapshot(
  airdropId: string,
  address: string
): Promise<void> {
  const airdrop = await getAirdropById(airdropId, address);
  if (!airdrop) return;

  const pool = getLaunchpadPool();
  const normalized = address.toLowerCase();

  const requiredTasks = airdrop.socialTasks.filter((t) => t.isRequired);
  const socialTasksTotal = requiredTasks.length;
  const socialTasksCompleted = requiredTasks.filter((t) => t.completed).length;

  const participant = await pool.query<{ social_gate_passed_at: Date | null }>(
    `SELECT social_gate_passed_at FROM airdrop_participants WHERE airdrop_id = $1::bigint AND address = $2`,
    [airdrop.id, normalized]
  );

  const socialGatePassed =
    socialTasksTotal === 0 ||
    socialTasksCompleted >= socialTasksTotal ||
    participant.rows[0]?.social_gate_passed_at != null;

  const minHoldWei = airdrop.rules.onchain?.minHoldWei;
  const minBuyWei = airdrop.rules.onchain?.minBuyBnbWei;
  const hasHoldRule = Boolean(minHoldWei && minHoldWei !== "0");
  const hasBuyRule = Boolean(minBuyWei && minBuyWei !== "0");

  let holdCurrent = 0;
  let buyCurrent = 0;

  if (socialGatePassed && (hasHoldRule || hasBuyRule)) {
    const indexed = await queryParticipantHoldAndBuy(
      airdrop.linkedToken,
      normalized,
      airdrop.qualifyStart,
      airdrop.qualifyEnd
    );
    holdCurrent = indexed.holdCurrent;
    buyCurrent = indexed.buyCurrent;

    if (hasHoldRule) {
      const liveHold = await fetchLiveTokenBalance(airdrop.linkedToken, normalized);
      holdCurrent = Math.max(holdCurrent, Number(liveHold));
    }
  }

  const progress = computeParticipantProgress({
    socialTasksTotal,
    socialTasksCompleted,
    socialGatePassed,
    hasHoldRule,
    hasBuyRule,
    minHoldTarget: hasHoldRule ? Number(weiStringToDecimal(minHoldWei!)) : 0,
    minBuyTarget: hasBuyRule ? Number(weiStringToDecimal(minBuyWei!)) : 0,
    holdCurrent,
    buyCurrent,
  });

  const allocation = await pool.query<{ rank: number; amount: string }>(
    `
      SELECT rank, amount::text
      FROM airdrop_allocations
      WHERE airdrop_id = $1::bigint AND address = $2
      LIMIT 1
    `,
    [airdrop.id, normalized]
  );

  const claim = await pool.query<{ block_time: Date }>(
    `
      SELECT block_time
      FROM airdrop_claims
      WHERE airdrop_id = $1::bigint AND claimant = $2
      LIMIT 1
    `,
    [airdrop.id, normalized]
  );

  let viewerRank = allocation.rows[0]?.rank ?? null;
  const claimableAmount = allocation.rows[0]?.amount ?? null;
  const claimedAt = claim.rows[0]?.block_time?.toISOString() ?? null;

  const displayStatus = getAirdropDisplayStatus({
    status: airdrop.status,
    qualifyStart: airdrop.qualifyStart,
    qualifyEnd: airdrop.qualifyEnd,
    claimEnd: airdrop.claimEnd,
    merkleRoot: airdrop.merkleRoot,
  });

  if (viewerRank == null && displayStatus === "QUALIFYING") {
    const leaderboard = await getAirdropLeaderboard(airdrop.id, {
      limit: 100,
      viewerAddress: normalized,
    });
    if (leaderboard.viewer?.rank != null) {
      viewerRank = leaderboard.viewer.rank;
    }
  }

  const snapshotProgressPct =
    viewerRank != null && !claimedAt ? 100 : progress.progressPct;

  await pool.query(
    `
      INSERT INTO airdrop_participants (
        airdrop_id,
        address,
        social_gate_passed_at,
        social_tasks_total,
        social_tasks_completed,
        hold_met,
        buy_met,
        onchain_qualified,
        progress_pct,
        viewer_rank,
        claimable_amount,
        claimed_at,
        updated_at
      )
      VALUES (
        $1::bigint, $2,
        CASE WHEN $3::boolean THEN now() ELSE NULL END,
        $4, $5, $6, $7, $8, $9, $10, $11, $12, now()
      )
      ON CONFLICT (airdrop_id, address) DO UPDATE SET
        social_gate_passed_at = COALESCE(
          airdrop_participants.social_gate_passed_at,
          CASE WHEN $3::boolean THEN now() ELSE NULL END
        ),
        social_tasks_total = EXCLUDED.social_tasks_total,
        social_tasks_completed = EXCLUDED.social_tasks_completed,
        hold_met = EXCLUDED.hold_met,
        buy_met = EXCLUDED.buy_met,
        onchain_qualified = EXCLUDED.onchain_qualified,
        progress_pct = EXCLUDED.progress_pct,
        viewer_rank = COALESCE(EXCLUDED.viewer_rank, airdrop_participants.viewer_rank),
        claimable_amount = COALESCE(EXCLUDED.claimable_amount, airdrop_participants.claimable_amount),
        claimed_at = COALESCE(EXCLUDED.claimed_at, airdrop_participants.claimed_at),
        updated_at = now()
    `,
    [
      airdrop.id,
      normalized,
      socialGatePassed,
      socialTasksTotal,
      socialTasksCompleted,
      progress.holdMet,
      progress.buyMet,
      progress.onchainQualified,
      snapshotProgressPct,
      viewerRank,
      claimableAmount,
      claimedAt,
    ]
  );
}

export async function listMyAirdropParticipations(
  userAddress: string,
  limit = 20
): Promise<MyAirdropParticipation[]> {
  const pool = getLaunchpadPool();
  const normalized = userAddress.toLowerCase();

  const result = await pool.query<{
    id: string;
    on_chain_id: string | null;
    rules_json: AirdropRules;
    linked_token: string;
    reward_token: string | null;
    total_funded: string;
    status: string;
    qualify_start: Date;
    qualify_end: Date;
    claim_end: Date | null;
    merkle_root: string | null;
    symbol: string | null;
    name: string | null;
    reward_symbol: string | null;
    reward_price_bnb: string | null;
    social_tasks_total: number | null;
    social_tasks_completed: number | null;
    hold_met: boolean | null;
    buy_met: boolean | null;
    onchain_qualified: boolean | null;
    progress_pct: number | null;
    viewer_rank: number | null;
    claimable_amount: string | null;
    claimed_at: Date | null;
  }>(
    `
      SELECT
        a.id,
        a.on_chain_id,
        a.rules_json,
        a.linked_token,
        a.reward_token,
        a.total_funded,
        a.status,
        a.qualify_start,
        a.qualify_end,
        a.claim_end,
        a.merkle_root,
        t.symbol,
        t.name,
        rt.symbol AS reward_symbol,
        COALESCE(rb.last_price_zug, 0)::text AS reward_price_bnb,
        p.social_tasks_total,
        p.social_tasks_completed,
        p.hold_met,
        p.buy_met,
        p.onchain_qualified,
        p.progress_pct,
        COALESCE(p.viewer_rank, aa.rank) AS viewer_rank,
        COALESCE(p.claimable_amount::text, aa.amount::text) AS claimable_amount,
        COALESCE(p.claimed_at, ac.block_time) AS claimed_at
      FROM (
        SELECT airdrop_id, MAX(sort_at) AS sort_at
        FROM (
          SELECT p.airdrop_id, GREATEST(p.updated_at, COALESCE(p.first_onchain_at, p.updated_at)) AS sort_at
          FROM airdrop_participants p
          WHERE p.address = $1
            AND (
              p.first_onchain_at IS NOT NULL
              OR p.onchain_qualified = true
              OR p.viewer_rank IS NOT NULL
            )
          UNION ALL
          SELECT aa.airdrop_id, aa.created_at AS sort_at
          FROM airdrop_allocations aa
          WHERE aa.address = $1
        ) raw
        GROUP BY airdrop_id
      ) joined
      JOIN airdrops a ON a.id = joined.airdrop_id
      LEFT JOIN tokens t ON t.address = a.linked_token
      LEFT JOIN tokens rt ON rt.address = a.reward_token
      LEFT JOIN bonding_states rb ON rb.token_address = a.reward_token
      LEFT JOIN airdrop_participants p
        ON p.airdrop_id = a.id AND p.address = $1
      LEFT JOIN airdrop_allocations aa
        ON aa.airdrop_id = a.id AND aa.address = $1
      LEFT JOIN airdrop_claims ac
        ON ac.airdrop_id = a.id AND ac.claimant = $1
      ORDER BY joined.sort_at DESC
      LIMIT $2
    `,
    [normalized, limit]
  );

  return result.rows.map((row) => {
    const displayStatus = getAirdropDisplayStatus({
      status: row.status,
      qualifyStart: row.qualify_start.toISOString(),
      qualifyEnd: row.qualify_end.toISOString(),
      claimEnd: row.claim_end?.toISOString() ?? null,
      merkleRoot: row.merkle_root,
    });
    const claimedAt = row.claimed_at?.toISOString() ?? null;
    const viewerRank = row.viewer_rank ?? null;

    return {
      id: row.id,
      onChainId: row.on_chain_id,
      title: row.rules_json?.title ?? null,
      linkedToken: row.linked_token,
      linkedSymbol: row.symbol,
      linkedName: row.name,
      rewardToken: row.reward_token,
      rewardSymbol: row.reward_symbol,
      rewardPriceBnb: row.reward_price_bnb,
      totalFunded: row.total_funded,
      status: row.status,
      qualifyStart: row.qualify_start.toISOString(),
      qualifyEnd: row.qualify_end.toISOString(),
      claimEnd: row.claim_end?.toISOString() ?? null,
      merkleRoot: row.merkle_root,
      displayStatus,
      socialTasksTotal: row.social_tasks_total ?? 0,
      socialTasksCompleted: row.social_tasks_completed ?? 0,
      holdMet: row.hold_met ?? false,
      buyMet: row.buy_met ?? false,
      onchainQualified: row.onchain_qualified ?? false,
      progressPct: row.progress_pct ?? 0,
      viewerRank,
      claimableAmount: row.claimable_amount,
      claimedAt,
      nextAction: deriveAirdropNextAction(displayStatus, {
        viewerRank,
        claimedAt,
        onchainQualified: row.onchain_qualified ?? false,
      }),
    };
  });
}

export async function listSavedAirdropIds(userAddress: string): Promise<string[]> {
  const pool = getLaunchpadPool();
  const normalized = userAddress.toLowerCase();
  const result = await pool.query<{ airdrop_id: string }>(
    `
      SELECT airdrop_id::text
      FROM airdrop_saves
      WHERE user_address = $1
      ORDER BY created_at DESC
    `,
    [normalized]
  );
  return result.rows.map((row) => row.airdrop_id);
}

export async function toggleAirdropSave(
  userAddress: string,
  airdropId: string
): Promise<boolean> {
  const pool = getLaunchpadPool();
  const user = userAddress.toLowerCase();

  const existing = await pool.query(
    `SELECT 1 FROM airdrop_saves WHERE user_address = $1 AND airdrop_id = $2::bigint`,
    [user, airdropId]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      `DELETE FROM airdrop_saves WHERE user_address = $1 AND airdrop_id = $2::bigint`,
      [user, airdropId]
    );
    return false;
  }

  const airdropExists = await pool.query(`SELECT 1 FROM airdrops WHERE id = $1::bigint`, [
    airdropId,
  ]);
  if (airdropExists.rows.length === 0) {
    throw new Error("Airdrop not found");
  }

  await pool.query(
    `INSERT INTO airdrop_saves (user_address, airdrop_id) VALUES ($1, $2::bigint)`,
    [user, airdropId]
  );
  return true;
}

/** @deprecated Use listMyAirdropParticipations — ids only helper */
export async function listMyAirdropIds(userAddress: string): Promise<string[]> {
  const rows = await listMyAirdropParticipations(userAddress, 500);
  return rows.map((row) => row.id);
}

function weiStringToDecimal(wei: string): string {
  if (!wei || wei === "0") return "0";
  const value = BigInt(wei);
  const whole = value / 10n ** 18n;
  const fraction = value % 10n ** 18n;
  const frac = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toString()}${frac ? `.${frac}` : ""}`;
}

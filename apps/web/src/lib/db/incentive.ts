import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  AIRDROP_WEIGHT_ITEM_ID,
  AIRDROP_WEIGHT_MULTIPLIER,
  LAUNCH_SPOTLIGHT_DURATION_MS,
  LAUNCH_SPOTLIGHT_ITEM_ID,
  type ActiveLaunchPin,
} from "@/lib/points-perk-effects";
import type { ActivatePerkResult, PointsInventoryItem } from "@/lib/points-inventory-types";
import { dbStorageAddress, normalizeUserStorageAddress } from "@/lib/address";

let pool: Pool | null = null;

export function getIncentivePool(): Pool {
  const url = process.env.VM1_MAIN_DB_URL;
  if (!url) {
    throw new Error("VM1_MAIN_DB_URL is required");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 30_000,
    });
  }

  return pool;
}

export type MissionKind = "DAILY" | "ONE_TIME" | "MILESTONE" | "ADMIN_LINK";
export type TaskSource = "system" | "admin_link";

export type MissionItem = {
  taskKey: string;
  title: string;
  description: string | null;
  rewardPoints: number;
  taskKind: MissionKind;
  taskSource: TaskSource;
  targetUrl: string | null;
  completed: boolean;
  completedAt: string | null;
  pointsAwarded: number;
};

export type AdminLinkTask = {
  taskKey: string;
  title: string;
  description: string | null;
  rewardPoints: number;
  targetUrl: string;
  isActive: boolean;
  createdAt: string;
  completionCount: number;
};

export type MissionsSnapshot = {
  address: string;
  /** Spendable balance (users.points). */
  totalPoints: number;
  /** Lifetime earned — drives levels (users.points_lifetime). */
  lifetimePoints: number;
  missions: MissionItem[];
  todayUtc: string;
};

const VOLUME_MONSTER_KEY = "LAUNCHPAD_VOLUME_MONSTER";
const FIRST_SMART_BUY_KEY = "LAUNCHPAD_FIRST_SMART_BUY";
const DAILY_SWAP_KEY = "LAUNCHPAD_DAILY_SWAP";
const DEPLOY_MEME_KEY = "LAUNCHPAD_DEPLOY_MEME";
export const REFERRAL_INVITE_XP_KEY = "LAUNCHPAD_REFERRAL_INVITE_XP";
export const REFERRAL_INVITE_XP_PER_INVITE = 50;

export type ReferralInviteXpStatus = {
  claimableCount: number;
  claimablePoints: number;
  claimedInviteCount: number;
  totalSuccessfulInvites: number;
  pointsPerInvite: number;
};

export type FirstSmartBuyAwardInput = {
  eventId: string;
  txHash: string;
  tokenAddress: string;
  zugAmountBnb: number;
};

export async function getMissionsForAddress(address: string): Promise<MissionsSnapshot> {
  const db = getIncentivePool();
  const todayUtc = new Date().toISOString().slice(0, 10);

  const [missionsResult, pointsResult] = await Promise.all([
    db.query<{
      task_key: string;
      title: string;
      description: string | null;
      reward_points: number;
      task_kind: MissionKind;
      task_source: TaskSource;
      target_url: string | null;
      completed_at: Date | null;
      points_awarded: number | null;
    }>(
      `
        SELECT
          t.task_key,
          t.title,
          t.description,
          t.reward_points,
          t.task_kind,
          t.task_source,
          t.target_url,
          CASE
            WHEN t.task_kind = 'DAILY' THEN dc.completed_at
            ELSE oc.completed_at
          END AS completed_at,
          CASE
            WHEN t.task_kind = 'DAILY' THEN dc.points_awarded
            ELSE oc.points_awarded
          END AS points_awarded
        FROM launchpad_tasks t
        LEFT JOIN launchpad_user_daily_completions dc
          ON dc.task_key = t.task_key
         AND dc.address = $1
         AND dc.completed_date = $2::date
        LEFT JOIN launchpad_user_task_completions oc
          ON oc.task_key = t.task_key
         AND oc.address = $1
         AND t.task_kind <> 'DAILY'
        WHERE t.is_active = true
        ORDER BY
          CASE t.task_kind
            WHEN 'DAILY' THEN 0
            WHEN 'ADMIN_LINK' THEN 1
            WHEN 'ONE_TIME' THEN 2
            WHEN 'MILESTONE' THEN 3
          END,
          t.created_at DESC,
          t.reward_points DESC
      `,
      [address, todayUtc]
    ),
    getUserPointsBalances(db, address),
  ]);

  const missions: MissionItem[] = missionsResult.rows.map((row) => ({
    taskKey: row.task_key,
    title: row.title,
    description: row.description,
    rewardPoints: row.reward_points,
    taskKind: row.task_kind,
    taskSource: row.task_source,
    targetUrl: row.target_url,
    completed: row.completed_at !== null,
    completedAt: row.completed_at?.toISOString() ?? null,
    pointsAwarded: row.points_awarded ?? 0,
  }));

  return {
    address,
    totalPoints: pointsResult.spendable,
    lifetimePoints: pointsResult.lifetime,
    missions,
    todayUtc,
  };
}

async function getUserPointsBalances(
  db: Pool,
  address: string
): Promise<{ spendable: number; lifetime: number }> {
  try {
    const result = await db.query<{ points: number | null; points_lifetime: number | null }>(
      `
        SELECT
          points,
          COALESCE(points_lifetime, points, 0) AS points_lifetime
        FROM users
        WHERE address = $1
      `,
      [address]
    );
    const spendable = Number(result.rows[0]?.points ?? 0);
    const lifetime = Number(result.rows[0]?.points_lifetime ?? spendable);
    return { spendable, lifetime: Math.max(lifetime, spendable) };
  } catch {
    const result = await db.query<{ points: number | null }>(
      "SELECT points FROM users WHERE address = $1",
      [address]
    );
    const spendable = Number(result.rows[0]?.points ?? 0);
    return { spendable, lifetime: spendable };
  }
}

/**
 * Award First Smart Buy when a qualifying trade exists in launchpad DB but
 * indexer missed the points write (e.g. VM1_MAIN_DB_URL was empty).
 */
export async function ensureFirstSmartBuyAward(
  address: string,
  trade: FirstSmartBuyAwardInput
): Promise<boolean> {
  const db = getIncentivePool();
  const normalized = dbStorageAddress(address);

  const existing = await db.query(
    `
      SELECT 1
      FROM launchpad_user_task_completions
      WHERE address = $1 AND task_key = $2
      LIMIT 1
    `,
    [normalized, FIRST_SMART_BUY_KEY]
  );
  if ((existing.rowCount ?? 0) > 0) return false;

  const awardResult = await db.query<{ status: string; points_awarded: number }>(
    `
      SELECT status, points_awarded
      FROM launchpad_award_points($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      normalized,
      FIRST_SMART_BUY_KEY,
      `${FIRST_SMART_BUY_KEY}:${trade.eventId}`,
      trade.txHash,
      null,
      JSON.stringify({
        source: "missions_api_reconcile",
        token: trade.tokenAddress,
        zug_amount_bnb: trade.zugAmountBnb,
      }),
    ]
  );

  return (awardResult.rows[0]?.points_awarded ?? 0) > 0;
}

/**
 * Award Daily Swap when a same-day trade exists but indexer missed the points write.
 */
export async function ensureDailySwapAward(
  address: string,
  trade: {
    eventId: string;
    txHash: string;
    tokenAddress: string;
    side: string;
    completedDate: string;
  }
): Promise<boolean> {
  const db = getIncentivePool();
  const normalized = dbStorageAddress(address);

  const existing = await db.query(
    `
      SELECT 1
      FROM launchpad_user_daily_completions
      WHERE address = $1 AND task_key = $2 AND completed_date = $3::date
      LIMIT 1
    `,
    [normalized, DAILY_SWAP_KEY, trade.completedDate]
  );
  if ((existing.rowCount ?? 0) > 0) return false;

  const awardResult = await db.query<{ status: string; points_awarded: number }>(
    `
      SELECT status, points_awarded
      FROM launchpad_award_points($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      normalized,
      DAILY_SWAP_KEY,
      `${DAILY_SWAP_KEY}:${trade.eventId}`,
      trade.txHash,
      trade.completedDate,
      JSON.stringify({
        source: "missions_api_reconcile",
        token: trade.tokenAddress,
        side: trade.side,
      }),
    ]
  );

  return (awardResult.rows[0]?.points_awarded ?? 0) > 0;
}

/**
 * Award Deploy Meme when a created token exists but indexer missed the points write.
 */
export async function ensureDeployMemeAward(
  address: string,
  token: {
    tokenAddress: string;
    launchTxHash: string;
    eventId?: string;
  }
): Promise<boolean> {
  const db = getIncentivePool();
  const normalized = dbStorageAddress(address);

  const existing = await db.query(
    `
      SELECT 1
      FROM launchpad_user_task_completions
      WHERE address = $1 AND task_key = $2
      LIMIT 1
    `,
    [normalized, DEPLOY_MEME_KEY]
  );
  if ((existing.rowCount ?? 0) > 0) return false;

  const eventId = token.eventId ?? `${token.launchTxHash}:0`;
  const awardResult = await db.query<{ status: string; points_awarded: number }>(
    `
      SELECT status, points_awarded
      FROM launchpad_award_points($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      normalized,
      DEPLOY_MEME_KEY,
      `${DEPLOY_MEME_KEY}:${eventId}`,
      token.launchTxHash,
      null,
      JSON.stringify({
        source: "missions_api_reconcile",
        token: token.tokenAddress,
      }),
    ]
  );

  return (awardResult.rows[0]?.points_awarded ?? 0) > 0;
}

export async function getReferralInviteXpStatus(
  referrerAddress: string
): Promise<ReferralInviteXpStatus> {
  const db = getIncentivePool();
  const normalized = dbStorageAddress(referrerAddress);

  const result = await db.query<{
    total_successful: string;
    claimed_count: string;
    claimable_count: string;
  }>(
    `
      SELECT
        (SELECT COUNT(*)::text FROM referral_bindings WHERE referrer_address = $1) AS total_successful,
        (SELECT COUNT(*)::text FROM referral_invite_xp_claims WHERE referrer_address = $1) AS claimed_count,
        (
          SELECT COUNT(*)::text
          FROM referral_bindings rb
          LEFT JOIN referral_invite_xp_claims c ON c.invitee_address = rb.invitee_address
          WHERE rb.referrer_address = $1
            AND c.invitee_address IS NULL
        ) AS claimable_count
    `,
    [normalized]
  );

  const row = result.rows[0];
  const totalSuccessfulInvites = Number(row?.total_successful ?? 0);
  const claimedInviteCount = Number(row?.claimed_count ?? 0);
  const claimableCount = Number(row?.claimable_count ?? 0);

  return {
    totalSuccessfulInvites,
    claimedInviteCount,
    claimableCount,
    claimablePoints: claimableCount * REFERRAL_INVITE_XP_PER_INVITE,
    pointsPerInvite: REFERRAL_INVITE_XP_PER_INVITE,
  };
}

/**
 * Claim 50 XP per unclaimed successful invite.
 * App-level (not the legacy SQL fn) so Solana base58 case is preserved —
 * `claim_referral_invite_xp` historically used lower() and returned 0 invites.
 */
export async function claimReferralInviteXp(
  referrerAddress: string
): Promise<{ claimedInvites: number; pointsAwarded: number }> {
  const db = getIncentivePool();
  const normalized = dbStorageAddress(referrerAddress);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Best-effort: drop EVM-era lowercase CHECKs (noop if already gone / no privs).
    try {
      await client.query(`
        ALTER TABLE public.referral_invite_xp_claims
          DROP CONSTRAINT IF EXISTS referral_invite_xp_claims_referrer_check
      `);
      await client.query(`
        ALTER TABLE public.referral_invite_xp_claims
          DROP CONSTRAINT IF EXISTS referral_invite_xp_claims_invitee_check
      `);
    } catch {
      /* pump_app may lack ALTER — migration 051 must be applied as postgres */
    }

    await client.query(
      `
        INSERT INTO users (address, last_active)
        VALUES ($1, now())
        ON CONFLICT (address) DO UPDATE SET last_active = now()
      `,
      [normalized]
    );

    const pending = await client.query<{ invitee_address: string }>(
      `
        SELECT rb.invitee_address
        FROM referral_bindings rb
        LEFT JOIN referral_invite_xp_claims c ON c.invitee_address = rb.invitee_address
        WHERE rb.referrer_address = $1
          AND c.invitee_address IS NULL
        ORDER BY rb.bound_at ASC
      `,
      [normalized]
    );

    let claimedInvites = 0;
    let pointsAwarded = 0;

    for (const row of pending.rows) {
      const invitee = row.invitee_address;
      const inserted = await client.query(
        `
          INSERT INTO referral_invite_xp_claims (
            referrer_address, invitee_address, points_awarded
          ) VALUES ($1, $2, $3)
          ON CONFLICT (invitee_address) DO NOTHING
        `,
        [normalized, invitee, REFERRAL_INVITE_XP_PER_INVITE]
      );
      if ((inserted.rowCount ?? 0) === 0) continue;

      claimedInvites += 1;
      pointsAwarded += REFERRAL_INVITE_XP_PER_INVITE;

      await client.query(
        `
          INSERT INTO points_audit_log (
            address, points_awarded, task_type, tx_hash, metadata
          ) VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          normalized,
          REFERRAL_INVITE_XP_PER_INVITE,
          REFERRAL_INVITE_XP_KEY,
          `claim:referral:${invitee}`,
          JSON.stringify({ invitee, source: "referral_invite_claim_app" }),
        ]
      );
    }

    if (pointsAwarded > 0) {
      await client.query(
        `
          UPDATE users
          SET points = COALESCE(points, 0) + $2,
              last_active = now()
          WHERE address = $1
        `,
        [normalized, pointsAwarded]
      );
    }

    await client.query("COMMIT");
    return { claimedInvites, pointsAwarded };
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : String(error);
    if (/referral_invite_xp_claims_(referrer|invitee)_check/i.test(message)) {
      throw new Error(
        "Referral claim blocked by Solana address CHECKs — apply db/migrations/051_claim_referral_invite_xp_solana.sql on pump_db"
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reconcile Volume Monster rewards when a completion row exists with 0 points,
 * or award it once volume target is reached and completion row is missing.
 */
export async function ensureVolumeMonsterAward(address: string): Promise<boolean> {
  const db = getIncentivePool();
  const normalized = dbStorageAddress(address);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const taskResult = await client.query<{
      reward_points: number;
      is_active: boolean;
    }>(
      `
      SELECT reward_points, is_active
      FROM launchpad_tasks
      WHERE task_key = $1
      LIMIT 1
      `,
      [VOLUME_MONSTER_KEY]
    );
    const task = taskResult.rows[0];
    if (!task || !task.is_active) {
      await client.query("COMMIT");
      return false;
    }

    await client.query(
      `
      INSERT INTO users (address, last_active)
      VALUES ($1, now())
      ON CONFLICT (address) DO UPDATE SET last_active = now()
      `,
      [normalized]
    );

    const completionResult = await client.query<{
      id: string;
      points_awarded: number;
    }>(
      `
      SELECT id::text, points_awarded
      FROM launchpad_user_task_completions
      WHERE address = $1
        AND task_key = $2
      LIMIT 1
      `,
      [normalized, VOLUME_MONSTER_KEY]
    );
    const completion = completionResult.rows[0] ?? null;

    if (!completion) {
      const awardResult = await client.query<{
        status: string;
        points_awarded: number;
      }>(
        `
        SELECT status, points_awarded
        FROM launchpad_award_points($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          normalized,
          VOLUME_MONSTER_KEY,
          `launchpad:volume-monster:${normalized}`,
          null,
          null,
          JSON.stringify({ source: "missions_api_reconcile" }),
        ]
      );
      await client.query("COMMIT");
      const awarded = awardResult.rows[0]?.points_awarded ?? 0;
      return awarded > 0;
    }

    if (completion.points_awarded > 0) {
      await client.query("COMMIT");
      return false;
    }

    const multiplierResult = await client.query<{ multiplier: string }>(
      `
      SELECT COALESCE(multiplier, 1.0)::text AS multiplier
      FROM users
      WHERE address = $1
      LIMIT 1
      `,
      [normalized]
    );
    const multiplier = Number(multiplierResult.rows[0]?.multiplier ?? 1);
    const points = Math.max(0, Math.floor(task.reward_points * (Number.isFinite(multiplier) ? multiplier : 1)));
    if (points <= 0) {
      await client.query("COMMIT");
      return false;
    }

    const repairMeta = JSON.stringify({
      source: "missions_api_repair",
      repaired_at: new Date().toISOString(),
    });

    const repaired = await client.query(
      `
      UPDATE launchpad_user_task_completions
      SET points_awarded = $2,
          metadata = metadata || $3::jsonb
      WHERE id = $1::bigint
        AND points_awarded = 0
      `,
      [completion.id, points, repairMeta]
    );

    if ((repaired.rowCount ?? 0) > 0) {
      await client.query(
        `
        UPDATE users
        SET points = COALESCE(points, 0) + $2,
            last_active = now()
        WHERE address = $1
        `,
        [normalized, points]
      );

      await client.query(
        `
        INSERT INTO points_audit_log (address, points_awarded, task_type, tx_hash, metadata)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          normalized,
          points,
          VOLUME_MONSTER_KEY,
          `launchpad:repair:volume-monster:${normalized}`,
          repairMeta,
        ]
      );
    }

    await client.query("COMMIT");
    return (repaired.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function isValidAdminLinkTargetUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildAdminLinkTaskKey(): string {
  return `ADMIN_LINK_${randomUUID().replace(/-/g, "")}`;
}

export async function listAdminLinkTasks(): Promise<AdminLinkTask[]> {
  const db = getIncentivePool();
  const result = await db.query<{
    task_key: string;
    title: string;
    description: string | null;
    reward_points: number;
    target_url: string;
    is_active: boolean;
    created_at: Date;
    completion_count: string;
  }>(
    `
      SELECT
        t.task_key,
        t.title,
        t.description,
        t.reward_points,
        t.target_url,
        t.is_active,
        t.created_at,
        COUNT(c.id)::text AS completion_count
      FROM launchpad_tasks t
      LEFT JOIN launchpad_user_task_completions c ON c.task_key = t.task_key
      WHERE t.task_source = 'admin_link'
      GROUP BY t.task_key
      ORDER BY t.created_at DESC
    `
  );

  return result.rows.map((row) => ({
    taskKey: row.task_key,
    title: row.title,
    description: row.description,
    rewardPoints: row.reward_points,
    targetUrl: row.target_url,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    completionCount: Number(row.completion_count) || 0,
  }));
}

export type CreateAdminLinkTaskInput = {
  title: string;
  description?: string | null;
  rewardPoints: number;
  targetUrl: string;
};

export async function createAdminLinkTask(input: CreateAdminLinkTaskInput): Promise<AdminLinkTask> {
  const title = input.title.trim();
  const targetUrl = input.targetUrl.trim();
  const description = input.description?.trim() ? input.description.trim() : null;

  if (!title) throw new Error("Title is required");
  if (!Number.isInteger(input.rewardPoints) || input.rewardPoints < 0) {
    throw new Error("Reward points must be a non-negative integer");
  }
  if (!isValidAdminLinkTargetUrl(targetUrl)) {
    throw new Error("Target URL must be a valid http or https link");
  }

  const db = getIncentivePool();
  const taskKey = buildAdminLinkTaskKey();

  const result = await db.query<{
    task_key: string;
    title: string;
    description: string | null;
    reward_points: number;
    target_url: string;
    is_active: boolean;
    created_at: Date;
  }>(
    `
      INSERT INTO launchpad_tasks (
        task_key, title, description, reward_points, task_kind, task_source, target_url, is_active
      )
      VALUES ($1, $2, $3, $4, 'ADMIN_LINK', 'admin_link', $5, true)
      RETURNING task_key, title, description, reward_points, target_url, is_active, created_at
    `,
    [taskKey, title, description, input.rewardPoints, targetUrl]
  );

  const row = result.rows[0];
  if (!row) throw new Error("Failed to create task");

  return {
    taskKey: row.task_key,
    title: row.title,
    description: row.description,
    rewardPoints: row.reward_points,
    targetUrl: row.target_url,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    completionCount: 0,
  };
}

export async function setAdminLinkTaskActive(taskKey: string, isActive: boolean): Promise<boolean> {
  const db = getIncentivePool();
  const result = await db.query(
    `
      UPDATE launchpad_tasks
      SET is_active = $2, updated_at = now()
      WHERE task_key = $1 AND task_source = 'admin_link'
    `,
    [taskKey, isActive]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAdminLinkTask(taskKey: string): Promise<boolean> {
  const db = getIncentivePool();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const taskResult = await client.query(
      `
        SELECT task_key
        FROM launchpad_tasks
        WHERE task_key = $1 AND task_source = 'admin_link'
        LIMIT 1
      `,
      [taskKey]
    );

    if ((taskResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `DELETE FROM launchpad_user_task_completions WHERE task_key = $1`,
      [taskKey]
    );
    await client.query(`DELETE FROM launchpad_points_sync_log WHERE task_key = $1`, [taskKey]);
    await client.query(
      `
        DELETE FROM launchpad_tasks
        WHERE task_key = $1 AND task_source = 'admin_link'
      `,
      [taskKey]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type CompleteAdminLinkTaskResult = {
  status: "SYNCED" | "SKIPPED" | "NOT_FOUND";
  pointsAwarded: number;
};

export async function completeAdminLinkTask(
  address: string,
  taskKey: string
): Promise<CompleteAdminLinkTaskResult> {
  const db = getIncentivePool();
  const normalized = dbStorageAddress(address);

  const taskResult = await db.query<{ is_active: boolean; target_url: string }>(
    `
      SELECT is_active, target_url
      FROM launchpad_tasks
      WHERE task_key = $1
        AND task_source = 'admin_link'
        AND task_kind = 'ADMIN_LINK'
      LIMIT 1
    `,
    [taskKey]
  );

  if ((taskResult.rowCount ?? 0) === 0) {
    return { status: "NOT_FOUND", pointsAwarded: 0 };
  }

  if (!taskResult.rows[0]?.is_active) {
    return { status: "SKIPPED", pointsAwarded: 0 };
  }

  const awardResult = await db.query<{ status: string; points_awarded: number }>(
    `
      SELECT status, points_awarded
      FROM launchpad_award_points($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      normalized,
      taskKey,
      `${taskKey}:${normalized}`,
      null,
      null,
      JSON.stringify({
        source: "admin_link_click",
        target_url: taskResult.rows[0]?.target_url ?? null,
      }),
    ]
  );

  const row = awardResult.rows[0];
  const pointsAwarded = row?.points_awarded ?? 0;
  const status = row?.status === "SYNCED" ? "SYNCED" : "SKIPPED";

  return { status, pointsAwarded };
}

export type RedeemPointsResult = {
  status: "COMPLETED" | "IDEMPOTENT" | "INSUFFICIENT" | "UNAVAILABLE" | "ERROR";
  pointsSpent: number;
  spendablePoints: number;
  lifetimePoints: number;
  inventoryId: number | null;
  error?: string;
};

export async function redeemMarketItem(input: {
  address: string;
  itemId: string;
  costPts: number;
  redeemKey: string;
  metadata?: Record<string, unknown>;
}): Promise<RedeemPointsResult> {
  const db = getIncentivePool();
  const normalized = dbStorageAddress(input.address);

  try {
    const result = await db.query<{
      status: string;
      points_spent: number;
      spendable_points: string | number;
      lifetime_points: string | number;
      inventory_id: string | number | null;
    }>(
      `
        SELECT status, points_spent, spendable_points, lifetime_points, inventory_id
        FROM launchpad_redeem_points($1, $2, $3, $4, $5::jsonb)
      `,
      [
        normalized,
        input.itemId,
        input.costPts,
        input.redeemKey,
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        status: "ERROR",
        pointsSpent: 0,
        spendablePoints: 0,
        lifetimePoints: 0,
        inventoryId: null,
        error: "Empty redeem response",
      };
    }

    return {
      status: row.status === "IDEMPOTENT" ? "IDEMPOTENT" : "COMPLETED",
      pointsSpent: Number(row.points_spent ?? 0),
      spendablePoints: Number(row.spendable_points ?? 0),
      lifetimePoints: Number(row.lifetime_points ?? 0),
      inventoryId: row.inventory_id != null ? Number(row.inventory_id) : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Redeem failed";
    if (message.includes("insufficient_points")) {
      return {
        status: "INSUFFICIENT",
        pointsSpent: 0,
        spendablePoints: 0,
        lifetimePoints: 0,
        inventoryId: null,
        error: message,
      };
    }
    if (message.includes("launchpad_redeem_points") || message.includes("does not exist")) {
      return {
        status: "UNAVAILABLE",
        pointsSpent: 0,
        spendablePoints: 0,
        lifetimePoints: 0,
        inventoryId: null,
        error: "Redeem is not available until migration 036 is applied.",
      };
    }
    return {
      status: "ERROR",
      pointsSpent: 0,
      spendablePoints: 0,
      lifetimePoints: 0,
      inventoryId: null,
      error: message,
    };
  }
}

export async function getPointsInventory(
  address: string
): Promise<PointsInventoryItem[]> {
  const db = getIncentivePool();
  try {
    const result = await db.query<{
      id: string | number;
      item_id: string;
      status: string;
      created_at: Date;
    }>(
      `
        SELECT id, item_id, status, created_at
        FROM points_inventory
        WHERE address = $1
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      `,
      [dbStorageAddress(address)]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      itemId: row.item_id,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function countUsableMarketItems(
  address: string,
  itemId: string
): Promise<number> {
  const db = getIncentivePool();
  try {
    const result = await db.query<{ n: string }>(
      `
        SELECT COUNT(*)::text AS n
        FROM points_inventory
        WHERE address = $1
          AND item_id = $2
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
      `,
      [dbStorageAddress(address), itemId]
    );
    return Number(result.rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Active Launch spotlight pins (consumed inventory still within 24h window).
 * Keyed by lowercased token address.
 */
export async function getActiveLaunchPins(): Promise<Map<string, ActiveLaunchPin>> {
  const map = new Map<string, ActiveLaunchPin>();
  const db = getIncentivePool();
  try {
    const result = await db.query<{
      id: string | number;
      address: string;
      token_address: string;
      expires_at: Date;
    }>(
      `
        SELECT
          id,
          address,
          LOWER(metadata->>'token_address') AS token_address,
          expires_at
        FROM points_inventory
        WHERE item_id = 'launch_boost'
          AND status = 'consumed'
          AND expires_at IS NOT NULL
          AND expires_at > now()
          AND COALESCE(metadata->>'token_address', '') ~ '^0x[a-fA-F0-9]{40}$'
        ORDER BY expires_at DESC, id DESC
      `
    );
    for (const row of result.rows) {
      const tokenAddress = row.token_address.toLowerCase();
      if (map.has(tokenAddress)) continue;
      map.set(tokenAddress, {
        tokenAddress,
        pinnerAddress: row.address.toLowerCase(),
        expiresAt: row.expires_at.toISOString(),
        inventoryId: Number(row.id),
      });
    }
  } catch {
    // incentive DB unavailable
  }
  return map;
}

export async function getActiveLaunchPinForToken(
  tokenAddress: string
): Promise<ActiveLaunchPin | null> {
  const pins = await getActiveLaunchPins();
  return pins.get(tokenAddress.toLowerCase()) ?? null;
}

/**
 * Consume one Launch spotlight and pin `tokenAddress` for 24h.
 * Caller must verify the wallet is the token creator (launchpad DB).
 */
export async function activateLaunchSpotlight(input: {
  address: string;
  tokenAddress: string;
  inventoryId?: number | null;
}): Promise<ActivatePerkResult> {
  const address = input.address.toLowerCase();
  const tokenAddress = input.tokenAddress.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address) || !/^0x[a-f0-9]{40}$/.test(tokenAddress)) {
    return { ok: false, error: "Invalid address", code: "INVALID" };
  }

  const db = getIncentivePool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string | number }>(
      `
        SELECT id
        FROM points_inventory
        WHERE item_id = $1
          AND status = 'consumed'
          AND expires_at IS NOT NULL
          AND expires_at > now()
          AND LOWER(metadata->>'token_address') = $2
        LIMIT 1
        FOR UPDATE
      `,
      [LAUNCH_SPOTLIGHT_ITEM_ID, tokenAddress]
    );
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "This token is already pinned. Wait until the spotlight expires.",
        code: "ALREADY_PINNED",
      };
    }

    const pick = await client.query<{ id: string | number }>(
      input.inventoryId != null
        ? `
            SELECT id
            FROM points_inventory
            WHERE id = $3
              AND address = $1
              AND item_id = $2
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > now())
            LIMIT 1
            FOR UPDATE
          `
        : `
            SELECT id
            FROM points_inventory
            WHERE address = $1
              AND item_id = $2
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY created_at ASC, id ASC
            LIMIT 1
            FOR UPDATE
          `,
      input.inventoryId != null
        ? [address, LAUNCH_SPOTLIGHT_ITEM_ID, input.inventoryId]
        : [address, LAUNCH_SPOTLIGHT_ITEM_ID]
    );

    const inv = pick.rows[0];
    if (!inv) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "No Launch spotlight perk available",
        code: "NO_INVENTORY",
      };
    }

    const expiresAt = new Date(Date.now() + LAUNCH_SPOTLIGHT_DURATION_MS);
    await client.query(
      `
        UPDATE points_inventory
        SET
          status = 'consumed',
          expires_at = $2::timestamptz,
          metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
        WHERE id = $1
      `,
      [
        inv.id,
        expiresAt.toISOString(),
        JSON.stringify({
          token_address: tokenAddress,
          activated_at: new Date().toISOString(),
          effect: "launch_spotlight",
        }),
      ]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      inventoryId: Number(inv.id),
      itemId: LAUNCH_SPOTLIGHT_ITEM_ID,
      expiresAt: expiresAt.toISOString(),
      tokenAddress,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const message = error instanceof Error ? error.message : "Activation failed";
    return { ok: false, error: message, code: "UNAVAILABLE" };
  } finally {
    client.release();
  }
}

/** Addresses that applied airdrop_weight to this campaign (consumed, permanent for campaign). */
export async function getAirdropWeightBoostAddresses(
  airdropId: string
): Promise<Set<string>> {
  const owned = new Set<string>();
  const id = airdropId.trim();
  if (!id) return owned;
  const db = getIncentivePool();
  try {
    const result = await db.query<{ address: string }>(
      `
        SELECT DISTINCT address
        FROM points_inventory
        WHERE item_id = 'airdrop_weight'
          AND status = 'consumed'
          AND metadata->>'airdrop_id' = $1
      `,
      [id]
    );
    for (const row of result.rows) {
      owned.add(row.address.toLowerCase());
    }
  } catch {
    // ignore
  }
  return owned;
}

export async function hasAirdropWeightBoost(
  address: string,
  airdropId: string
): Promise<boolean> {
  const db = getIncentivePool();
  try {
    const result = await db.query<{ ok: number }>(
      `
        SELECT 1 AS ok
        FROM points_inventory
        WHERE address = $1
          AND item_id = 'airdrop_weight'
          AND status = 'consumed'
          AND metadata->>'airdrop_id' = $2
        LIMIT 1
      `,
      [dbStorageAddress(address), airdropId.trim()]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Consume one Airdrop multiplier and attach it to a campaign.
 * Caller verifies airdrop exists / is open (launchpad DB).
 */
export async function activateAirdropWeight(input: {
  address: string;
  airdropId: string;
  inventoryId?: number | null;
}): Promise<ActivatePerkResult> {
  const address = input.address.toLowerCase();
  const airdropId = input.airdropId.trim();
  if (!/^0x[a-f0-9]{40}$/.test(address) || !airdropId) {
    return { ok: false, error: "Invalid input", code: "INVALID" };
  }

  const db = getIncentivePool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string | number }>(
      `
        SELECT id
        FROM points_inventory
        WHERE address = $1
          AND item_id = $2
          AND status = 'consumed'
          AND metadata->>'airdrop_id' = $3
        LIMIT 1
        FOR UPDATE
      `,
      [address, AIRDROP_WEIGHT_ITEM_ID, airdropId]
    );
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "Multiplier already applied to this airdrop",
        code: "ALREADY_APPLIED",
      };
    }

    const pick = await client.query<{ id: string | number }>(
      input.inventoryId != null
        ? `
            SELECT id
            FROM points_inventory
            WHERE id = $3
              AND address = $1
              AND item_id = $2
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > now())
            LIMIT 1
            FOR UPDATE
          `
        : `
            SELECT id
            FROM points_inventory
            WHERE address = $1
              AND item_id = $2
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY created_at ASC, id ASC
            LIMIT 1
            FOR UPDATE
          `,
      input.inventoryId != null
        ? [address, AIRDROP_WEIGHT_ITEM_ID, input.inventoryId]
        : [address, AIRDROP_WEIGHT_ITEM_ID]
    );

    const inv = pick.rows[0];
    if (!inv) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "No Airdrop multiplier perk available",
        code: "NO_INVENTORY",
      };
    }

    await client.query(
      `
        UPDATE points_inventory
        SET
          status = 'consumed',
          metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
        WHERE id = $1
      `,
      [
        inv.id,
        JSON.stringify({
          airdrop_id: airdropId,
          activated_at: new Date().toISOString(),
          effect: "airdrop_weight",
          multiplier: AIRDROP_WEIGHT_MULTIPLIER,
        }),
      ]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      inventoryId: Number(inv.id),
      itemId: AIRDROP_WEIGHT_ITEM_ID,
      expiresAt: null,
      airdropId,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    const message = error instanceof Error ? error.message : "Activation failed";
    return { ok: false, error: message, code: "UNAVAILABLE" };
  } finally {
    client.release();
  }
}

/** True when the wallet owns an active `status_badge` (or other) inventory row. */
export async function hasActiveMarketItem(
  address: string,
  itemId: string
): Promise<boolean> {
  const db = getIncentivePool();
  let normalized: string;
  try {
    normalized = normalizeUserStorageAddress(address);
  } catch {
    return false;
  }
  try {
    const result = await db.query<{ ok: number }>(
      `
        SELECT 1 AS ok
        FROM points_inventory
        WHERE address = $1
          AND item_id = $2
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `,
      [normalized, itemId]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/** Batch: which addresses own an active inventory item (e.g. profile badge). */
export async function addressesWithActiveMarketItem(
  addresses: string[],
  itemId: string
): Promise<Set<string>> {
  const normalized = [
    ...new Set(
      addresses
        .map((address) => {
          try {
            return normalizeUserStorageAddress(address);
          } catch {
            return null;
          }
        })
        .filter((address): address is string => address != null)
    ),
  ];
  const owned = new Set<string>();
  if (normalized.length === 0) return owned;

  const db = getIncentivePool();
  try {
    const result = await db.query<{ address: string }>(
      `
        SELECT DISTINCT address
        FROM points_inventory
        WHERE address = ANY($1::text[])
          AND item_id = $2
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
      `,
      [normalized, itemId]
    );
    for (const row of result.rows) {
      try {
        owned.add(normalizeUserStorageAddress(row.address));
      } catch {
        owned.add(row.address);
      }
    }
  } catch {
    // incentive DB unavailable — treat as no badges
  }
  return owned;
}

export type XpLeaderboardEntry = {
  rank: number;
  address: string;
  username: string | null;
  lifetimePoints: number;
};

/** Top traders by lifetime XP (falls back to spendable points if lifetime column missing). */
export async function getXpLeaderboard(limit = 100): Promise<XpLeaderboardEntry[]> {
  const db = getIncentivePool();
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));

  try {
    const result = await db.query<{
      address: string;
      username: string | null;
      lifetime_points: string | number;
    }>(
      `
        SELECT
          address,
          username,
          COALESCE(points_lifetime, points, 0) AS lifetime_points
        FROM users
        WHERE COALESCE(points_lifetime, points, 0) > 0
        ORDER BY COALESCE(points_lifetime, points, 0) DESC, address ASC
        LIMIT $1
      `,
      [safeLimit]
    );

    return result.rows.map((row, index) => ({
      rank: index + 1,
      address: row.address,
      username: row.username,
      lifetimePoints: Number(row.lifetime_points) || 0,
    }));
  } catch {
    const result = await db.query<{
      address: string;
      username: string | null;
      lifetime_points: string | number;
    }>(
      `
        SELECT
          address,
          username,
          COALESCE(points, 0) AS lifetime_points
        FROM users
        WHERE COALESCE(points, 0) > 0
        ORDER BY COALESCE(points, 0) DESC, address ASC
        LIMIT $1
      `,
      [safeLimit]
    );

    return result.rows.map((row, index) => ({
      rank: index + 1,
      address: row.address,
      username: row.username,
      lifetimePoints: Number(row.lifetime_points) || 0,
    }));
  }
}

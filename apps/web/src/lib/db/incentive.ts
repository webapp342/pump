import { randomUUID } from "node:crypto";
import { Pool } from "pg";

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
  const normalized = address.toLowerCase();

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
 * Reconcile Volume Monster rewards when a completion row exists with 0 points,
 * or award it once volume target is reached and completion row is missing.
 */
export async function ensureVolumeMonsterAward(address: string): Promise<boolean> {
  const db = getIncentivePool();
  const normalized = address.toLowerCase();
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
  const normalized = address.toLowerCase();

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
  const normalized = input.address.toLowerCase();

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

export async function getPointsLedger(
  address: string,
  limit = 40
): Promise<import("@/lib/points-activity-types").PointsLedgerEntry[]> {
  const db = getIncentivePool();
  const result = await db.query<{
    id: string | number;
    points_awarded: number;
    task_type: string;
    created_at: Date;
    metadata: Record<string, unknown> | null;
  }>(
    `
      SELECT id, points_awarded, task_type, created_at, metadata
      FROM points_audit_log
      WHERE address = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [address.toLowerCase(), Math.min(100, Math.max(1, limit))]
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    pointsDelta: Number(row.points_awarded),
    taskType: row.task_type,
    createdAt: row.created_at.toISOString(),
    metadata: row.metadata,
  }));
}

export async function getPointsInventory(
  address: string
): Promise<import("@/lib/points-activity-types").PointsInventoryItem[]> {
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
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      `,
      [address.toLowerCase()]
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

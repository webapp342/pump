import { Pool } from "pg";
import { getLaunchpadPool } from "@/lib/db/launchpad";
import { getIncentivePool } from "@/lib/db/incentive";
import { readIndexerCursorForEnv } from "@/lib/db/indexer-env-seed";
import { purgeRuntimeStores, type WipeRuntimePurgeResult } from "@/lib/db/admin-wipe-runtime";

export {
  WIPE_DATA_CONFIRMATION_PHRASE,
  WIPE_PRESERVED_TABLES,
  WIPE_TRUNCATED_TABLES,
} from "@/lib/admin/wipe-data.constants";

export type WipeAppDataResult = {
  ok: true;
  preserved: string[];
  truncated?: string[];
  xpPurged?: boolean;
  incentiveDbSeparate?: boolean;
  runtime?: WipeRuntimePurgeResult;
};

export async function readIndexerCursor(): Promise<{
  key: string;
  block: string;
  updatedAt: string;
} | null> {
  return readIndexerCursorForEnv();
}

function dbFingerprint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Rewards Leaderboard = `users.points_lifetime` (via incentive pool).
 * Purge XP tables so Season rankings cannot survive a clean-start wipe.
 */
async function purgeRewardsXpLeaderboardSource(pool: Pool): Promise<void> {
  await pool.query(`
    DO $wipe$
    DECLARE
      t text;
      tables text[] := ARRAY[
        'points_inventory',
        'points_redemptions',
        'points_audit_log',
        'launchpad_user_daily_completions',
        'launchpad_user_task_completions',
        'launchpad_points_sync_log',
        'referral_invite_xp_claims',
        'users'
      ];
      existing text[] := ARRAY[]::text[];
    BEGIN
      FOREACH t IN ARRAY tables LOOP
        IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
          existing := array_append(existing, format('public.%I', t));
        END IF;
      END LOOP;
      IF cardinality(existing) > 0 THEN
        EXECUTE 'TRUNCATE TABLE ' || array_to_string(existing, ', ') ||
          ' RESTART IDENTITY CASCADE';
      END IF;
    END
    $wipe$;
  `);
}

export async function wipeLaunchpadAppData(): Promise<WipeAppDataResult> {
  const pool = getLaunchpadPool();
  const result = await pool.query<{ wipe_launchpad_app_data: WipeAppDataResult }>(
    `SELECT wipe_launchpad_app_data() AS wipe_launchpad_app_data`
  );

  const payload = result.rows[0]?.wipe_launchpad_app_data;
  if (!payload?.ok) {
    throw new Error("Wipe function did not return success");
  }

  const launchpadUrl = process.env.LAUNCHPAD_DATABASE_URL?.trim() ?? "";
  const incentiveUrl = process.env.VM1_MAIN_DB_URL?.trim() ?? "";
  const separate =
    Boolean(incentiveUrl) &&
    Boolean(launchpadUrl) &&
    dbFingerprint(incentiveUrl) !== dbFingerprint(launchpadUrl);

  // Rewards UI reads this pool — must be empty after wipe.
  await purgeRewardsXpLeaderboardSource(getIncentivePool());

  // Legacy: if VM1_MAIN_DB_URL still points at another DB, purge leftover EVM XP there too.
  if (separate && incentiveUrl) {
    const legacy = new Pool({
      connectionString: incentiveUrl,
      max: 1,
      idleTimeoutMillis: 5_000,
    });
    try {
      await purgeRewardsXpLeaderboardSource(legacy);
    } finally {
      await legacy.end();
    }
  }

  const runtime = await purgeRuntimeStores();

  return {
    ...payload,
    xpPurged: true,
    incentiveDbSeparate: separate,
    runtime,
  };
}

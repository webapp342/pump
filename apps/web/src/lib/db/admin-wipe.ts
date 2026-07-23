import { Pool } from "pg";
import { getLaunchpadPool } from "@/lib/db/launchpad";
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
  runtime?: WipeRuntimePurgeResult;
  warnings?: string[];
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

/** Legacy second DB — call same SECURITY DEFINER wipe fn if present. */
async function wipeLegacyIncentiveDb(connectionString: string): Promise<string | null> {
  const legacy = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5_000,
  });
  try {
    await legacy.query(`SELECT wipe_launchpad_app_data() AS wipe_launchpad_app_data`);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "legacy DB wipe failed";
    return message;
  } finally {
    await legacy.end();
  }
}

export async function wipeLaunchpadAppData(): Promise<WipeAppDataResult> {
  const warnings: string[] = [];
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

  if (separate && incentiveUrl) {
    const legacyWarning = await wipeLegacyIncentiveDb(incentiveUrl);
    if (legacyWarning) {
      warnings.push(`Legacy incentive DB: ${legacyWarning}`);
    }
  }

  // Weekly leaderboard reads Redis ZSET — always purge after PG wipe.
  const runtime = await purgeRuntimeStores();
  if (runtime.redis && !runtime.redis.ok) {
    warnings.push(`Redis purge: ${runtime.redis.error ?? "failed"}`);
  }
  if (runtime.clickhouse && !runtime.clickhouse.ok) {
    warnings.push(`ClickHouse purge: ${runtime.clickhouse.error ?? "failed"}`);
  }

  return {
    ...payload,
    runtime,
    warnings,
  };
}

/** Best-effort Redis/CH cleanup when PG wipe already ran but a later step failed. */
export async function wipeRuntimeStoresOnly(): Promise<WipeRuntimePurgeResult> {
  return purgeRuntimeStores();
}

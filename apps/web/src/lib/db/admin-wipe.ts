import { getLaunchpadPool } from "@/lib/db/launchpad";
import { readIndexerCursorForEnv } from "@/lib/db/indexer-env-seed";

export {
  WIPE_DATA_CONFIRMATION_PHRASE,
  WIPE_PRESERVED_TABLES,
  WIPE_TRUNCATED_TABLES,
} from "@/lib/admin/wipe-data.constants";

export type WipeAppDataResult = {
  ok: true;
  preserved: string[];
};

export async function readIndexerCursor(): Promise<{
  key: string;
  block: string;
  updatedAt: string;
} | null> {
  return readIndexerCursorForEnv();
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

  return payload;
}

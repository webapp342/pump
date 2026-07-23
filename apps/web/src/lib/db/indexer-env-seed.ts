import fs from "node:fs/promises";
import path from "node:path";
import { readAdminEnvVariables, resolveEnvFilePath, resolvePumpRepoRoot } from "@/lib/admin/env-files";
import { getLaunchpadPool } from "@/lib/db/launchpad";

/** Must match apps/indexer/src/config.ts default when INDEXER_STATE_KEY is unset. */
export const DEFAULT_INDEXER_STATE_KEY = "launchpad_indexer";
export const DEFAULT_SOLANA_INDEXER_STATE_KEY = "solana_indexer";

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function readSolanaIndexerEnvConfig(): Promise<IndexerEnvConfig | null> {
  const envPath = path.join(resolvePumpRepoRoot(), "apps", "indexer-sol", ".env");
  try {
    const content = await fs.readFile(envPath, "utf8");
    const vars = parseDotEnv(content);
    const stateKey = vars.SOLANA_INDEXER_STATE_KEY?.trim() || DEFAULT_SOLANA_INDEXER_STATE_KEY;
    const startRaw = vars.SOLANA_INDEXER_START_SLOT?.trim() ?? "0";
    if (!/^\d+$/.test(startRaw)) return null;
    const startBlock = BigInt(startRaw);
    const seedBlock = startBlock > 0n ? startBlock - 1n : 0n;
    return { stateKey, startBlock, seedBlock, envPath };
  } catch {
    return null;
  }
}

export type IndexerEnvConfig = {
  stateKey: string;
  startBlock: bigint;
  seedBlock: bigint;
  envPath: string;
};

export type IndexerSeedResult =
  | {
      ok: true;
      stateKey: string;
      seedBlock: string;
      resyncFromBlock: string;
      envPath: string;
    }
  | {
      ok: false;
      reason: string;
      envPath: string;
    };

export async function readIndexerEnvConfig(): Promise<IndexerEnvConfig | null> {
  try {
    const { path: envPath, variables } = await readAdminEnvVariables("indexer");
    const stateKey =
      variables.find((v) => v.key === "INDEXER_STATE_KEY")?.value.trim() ||
      DEFAULT_INDEXER_STATE_KEY;
    const startRaw = variables.find((v) => v.key === "INDEXER_START_BLOCK")?.value.trim();
    if (startRaw && /^\d+$/.test(startRaw)) {
      const startBlock = BigInt(startRaw);
      const seedBlock = startBlock > 0n ? startBlock - 1n : 0n;
      return { stateKey, startBlock, seedBlock, envPath };
    }
  } catch {
    // fall through to Solana env
  }
  return readSolanaIndexerEnvConfig();
}

/** Seed indexer_state from /var/www/pump/Indexer/.env after DB wipe. */
export async function seedIndexerStateFromEnv(): Promise<IndexerSeedResult> {
  let envPath = "";
  try {
    envPath = resolveEnvFilePath("indexer");
  } catch {
    envPath = "(Indexer .env path not configured)";
  }

  const config = await readIndexerEnvConfig();
  if (!config) {
    return {
      ok: false,
      reason:
        "Set SOLANA_INDEXER_START_SLOT in apps/indexer-sol/.env (or INDEXER_START_BLOCK in Indexer .env) before wipe.",
      envPath,
    };
  }

  const pool = getLaunchpadPool();
  await pool.query(`DELETE FROM indexer_state`);
  await pool.query(
    `INSERT INTO indexer_state (key, last_block_number, updated_at)
     VALUES ($1, $2, now())`,
    [config.stateKey, config.seedBlock.toString()]
  );

  return {
    ok: true,
    stateKey: config.stateKey,
    seedBlock: config.seedBlock.toString(),
    resyncFromBlock: config.startBlock.toString(),
    envPath: config.envPath,
  };
}

export async function readIndexerCursorForEnv(): Promise<{
  key: string;
  block: string;
  updatedAt: string;
} | null> {
  const config = await readIndexerEnvConfig();
  const stateKey = config?.stateKey ?? DEFAULT_SOLANA_INDEXER_STATE_KEY;

  const pool = getLaunchpadPool();
  const result = await pool.query<{
    key: string;
    last_block_number: string;
    updated_at: Date;
  }>(
    `SELECT key, last_block_number::text, updated_at
     FROM indexer_state
     WHERE key = $1
     LIMIT 1`,
    [stateKey]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    key: row.key,
    block: row.last_block_number,
    updatedAt: row.updated_at.toISOString(),
  };
}

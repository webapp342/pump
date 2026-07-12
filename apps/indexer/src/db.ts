import pg from "pg";
import type { Address } from "viem";
import { normalizeAddress } from "./utils.js";

const { Pool } = pg;

export type ContractRegistry = {
  memeFactory: Address;
  bondingCurveManager: Address;
  pumpAirdropManager?: Address;
};

export type DatabasePools = {
  launchpad: pg.Pool;
  vm1?: pg.Pool;
};

export function createPools(launchpadDatabaseUrl: string, vm1MainDatabaseUrl?: string): DatabasePools {
  const viaBouncer = process.env.PGBOUNCER_ENABLED === "true";
  const max = viaBouncer ? Number(process.env.PG_POOL_MAX ?? 4) : 10;

  const poolOpts: pg.PoolConfig = {
    connectionString: launchpadDatabaseUrl,
    max,
    ...(viaBouncer ? { prepareThreshold: 0 } : {}),
  };

  return {
    launchpad: new Pool(poolOpts),
    vm1: vm1MainDatabaseUrl
      ? new Pool({
          connectionString: vm1MainDatabaseUrl,
          max: 4,
          ...(viaBouncer ? { prepareThreshold: 0 } : {}),
        })
      : undefined
  };
}

export async function closePools(pools: DatabasePools): Promise<void> {
  await Promise.all([pools.launchpad.end(), pools.vm1?.end()]);
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadContractRegistry(pool: pg.Pool): Promise<ContractRegistry> {
  const result = await pool.query<{ contract_key: string; address: string }>(
    `
      SELECT contract_key, address
      FROM contract_registry
      WHERE is_active = true
        AND contract_key IN (
          'meme_factory',
          'bonding_curve_manager',
          'pump_airdrop_manager'
        )
    `
  );

  const registry = new Map(result.rows.map((row) => [row.contract_key, normalizeAddress(row.address)]));
  const memeFactory = registry.get("meme_factory");
  const bondingCurveManager = registry.get("bonding_curve_manager");
  const envAirdrop = process.env.PUMP_AIRDROP_MANAGER?.trim();
  const pumpAirdropManager =
    registry.get("pump_airdrop_manager") ??
    (envAirdrop ? normalizeAddress(envAirdrop) : undefined);

  if (!memeFactory || !bondingCurveManager) {
    throw new Error("Missing required launchpad contracts in contract_registry (meme_factory, bonding_curve_manager)");
  }

  return {
    memeFactory,
    bondingCurveManager,
    pumpAirdropManager
  };
}

export async function getIndexerStartBlock(pool: pg.Pool, stateKey: string, fallback: bigint): Promise<bigint> {
  const result = await pool.query<{ last_block_number: string }>(
    "SELECT last_block_number FROM indexer_state WHERE key = $1",
    [stateKey]
  );

  if (result.rowCount && result.rows[0]) {
    return BigInt(result.rows[0].last_block_number) + 1n;
  }

  await pool.query(
    `
      INSERT INTO indexer_state (key, last_block_number)
      VALUES ($1, $2)
      ON CONFLICT (key) DO NOTHING
    `,
    [stateKey, (fallback - 1n).toString()]
  );

  return fallback;
}

export async function updateIndexerState(pool: pg.Pool, stateKey: string, blockNumber: bigint): Promise<void> {
  await pool.query(
    `
      INSERT INTO indexer_state (key, last_block_number, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (key) DO UPDATE
      SET last_block_number = GREATEST(indexer_state.last_block_number, EXCLUDED.last_block_number),
          updated_at = now()
    `,
    [stateKey, blockNumber.toString()]
  );
}

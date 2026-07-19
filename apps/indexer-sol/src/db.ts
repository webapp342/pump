import pg from "pg";

const { Pool } = pg;

export function createPool(launchpadDatabaseUrl: string): pg.Pool {
  const viaBouncer = process.env.PGBOUNCER_ENABLED === "true";
  const max = viaBouncer ? Number(process.env.PG_POOL_MAX ?? 4) : 10;
  return new Pool({
    connectionString: launchpadDatabaseUrl,
    max,
    ...(viaBouncer ? { prepareThreshold: 0 } : {}),
  });
}

/** Reuses EVM indexer_state; slot stored in last_block_number. */
export async function getIndexerStartSlot(
  pool: pg.Pool,
  stateKey: string,
  fallback: bigint
): Promise<bigint> {
  const result = await pool.query<{ last_block_number: string }>(
    "SELECT last_block_number FROM indexer_state WHERE key = $1",
    [stateKey]
  );
  if (result.rows[0]) {
    return BigInt(result.rows[0].last_block_number);
  }
  await pool.query(
    `
      INSERT INTO indexer_state (key, last_block_number)
      VALUES ($1, $2)
      ON CONFLICT (key) DO NOTHING
    `,
    [stateKey, (fallback > 0n ? fallback - 1n : 0n).toString()]
  );
  return fallback > 0n ? fallback - 1n : 0n;
}

export async function updateIndexerSlot(
  pool: pg.Pool,
  stateKey: string,
  slot: bigint
): Promise<void> {
  await pool.query(
    `
      INSERT INTO indexer_state (key, last_block_number, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET last_block_number = GREATEST(indexer_state.last_block_number, EXCLUDED.last_block_number),
          updated_at = NOW()
    `,
    [stateKey, slot.toString()]
  );
}

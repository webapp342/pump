import { Pool, type PoolConfig } from "pg";

let writePool: Pool | null = null;
let readPool: Pool | null = null;

function pgbouncerEnabled(): boolean {
  return process.env.PGBOUNCER_ENABLED === "true";
}

function poolConfig(connectionString: string): PoolConfig {
  const viaBouncer = pgbouncerEnabled();
  return {
    connectionString,
    max: viaBouncer ? Number(process.env.PG_POOL_MAX ?? 4) : Number(process.env.PG_POOL_MAX ?? 8),
    idleTimeoutMillis: viaBouncer ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: false,
  };
}

/** Primary — writes and transactional reads. */
export function getLaunchpadWritePool(): Pool {
  const url = process.env.LAUNCHPAD_DATABASE_URL;
  if (!url) {
    throw new Error("LAUNCHPAD_DATABASE_URL is required");
  }

  if (!writePool) {
    writePool = new Pool(poolConfig(url));
  }

  return writePool;
}

/**
 * Read replica — arena, token, portfolio SELECT paths.
 * Falls back to primary when LAUNCHPAD_DATABASE_READ_URL is unset.
 */
export function getLaunchpadReadPool(): Pool {
  const url =
    process.env.LAUNCHPAD_DATABASE_READ_URL?.trim() ||
    process.env.LAUNCHPAD_DATABASE_URL;
  if (!url) {
    throw new Error("LAUNCHPAD_DATABASE_URL is required");
  }

  if (!readPool) {
    readPool = new Pool(poolConfig(url));
  }

  return readPool;
}

import "dotenv/config";

export type IndexerConfig = {
  launchpadDatabaseUrl: string;
  vm1MainDatabaseUrl?: string;
  rpcUrl: string;
  rpcUrls: string[];
  chainId: number;
  startBlock: bigint;
  confirmations: bigint;
  chunkSize: bigint;
  pollIntervalMs: number;
  stateKey: string;
  once: boolean;
  mvRefreshEnabled: boolean;
  redisPublishEnabled: boolean;
  redisUrl?: string;
  useWsBlocks: boolean;
  wsRpcUrl?: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

function integer(name: string, fallback: number): number {
  const value = optional(name);
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function booleanFlag(name: string, fallback: boolean): boolean {
  const value = optional(name);
  if (!value) return fallback;

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function rpcUrlsFromEnv(): string[] {
  const raw =
    optional("BSC_RPC_URL") ??
    optional("ZUGCHAIN_RPC_URL") ??
    optional("RPC_URL");
  if (!raw) {
    throw new Error("BSC_RPC_URL or ZUGCHAIN_RPC_URL is required");
  }
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export const config: IndexerConfig = {
  launchpadDatabaseUrl: required("LAUNCHPAD_DATABASE_URL"),
  vm1MainDatabaseUrl: optional("VM1_MAIN_DB_URL"),
  rpcUrl: rpcUrlsFromEnv()[0]!,
  rpcUrls: rpcUrlsFromEnv(),
  chainId: integer("ZUGCHAIN_CHAIN_ID", 824642),
  startBlock: BigInt(integer("INDEXER_START_BLOCK", 0)),
  confirmations: BigInt(integer("INDEXER_CONFIRMATIONS", 2)),
  chunkSize: BigInt(integer("INDEXER_CHUNK_SIZE", 1_000)),
  pollIntervalMs: integer("INDEXER_POLL_INTERVAL_MS", 5_000),
  stateKey: optional("INDEXER_STATE_KEY") ?? "launchpad_indexer",
  once: booleanFlag("INDEXER_ONCE", false),
  mvRefreshEnabled: booleanFlag("MV_REFRESH_ENABLED", false),
  redisPublishEnabled: booleanFlag("REDIS_PUBLISH_ENABLED", false),
  redisUrl: optional("REDIS_URL"),
  useWsBlocks: booleanFlag("INDEXER_USE_WS_BLOCKS", false),
  wsRpcUrl: optional("BSC_WS_URL") ?? optional("ZUGCHAIN_WS_URL"),
};

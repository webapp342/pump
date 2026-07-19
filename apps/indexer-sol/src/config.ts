import "dotenv/config";
import {
  PROGRAM_IDS,
  PUMP_FEEL_DEFAULTS,
  SOLANA_DB_CHAIN_ID,
  resolveSolanaCluster,
  resolveSolanaRpcUrl,
  type SolanaCluster,
} from "@pump/solana-sdk";

export type IndexerSolConfig = {
  launchpadDatabaseUrl: string;
  rpcUrl: string;
  cluster: SolanaCluster;
  chainId: number;
  tokenDecimals: number;
  factoryProgramId: string;
  curveProgramId: string;
  treasuryProgramId: string;
  /** Cursor key in indexer_state (stores last slot). */
  stateKey: string;
  startSlot: bigint;
  pollIntervalMs: number;
  once: boolean;
  /**
   * `rpc` — Connection.onLogs (dev).
   * `laserstream` — Helius LaserStream / Yellowstone gRPC (prod target).
   */
  source: "rpc" | "laserstream";
  laserstreamEndpoint?: string;
  heliusApiKey?: string;
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

const cluster = resolveSolanaCluster(
  optional("SOLANA_CLUSTER") ?? optional("NEXT_PUBLIC_SOLANA_CLUSTER")
);

const sourceRaw = (optional("SOLANA_INDEXER_SOURCE") ?? "rpc").toLowerCase();
const source: "rpc" | "laserstream" =
  sourceRaw === "laserstream" || sourceRaw === "helius" ? "laserstream" : "rpc";

const chainIdOverride = optional("SOLANA_CHAIN_ID");

export const config: IndexerSolConfig = {
  launchpadDatabaseUrl: required("LAUNCHPAD_DATABASE_URL"),
  rpcUrl: resolveSolanaRpcUrl({
    cluster,
    rpcUrl: optional("SOLANA_RPC_URL") ?? optional("NEXT_PUBLIC_SOLANA_RPC_URL"),
  }),
  cluster,
  chainId: chainIdOverride
    ? integer("SOLANA_CHAIN_ID", SOLANA_DB_CHAIN_ID[cluster])
    : SOLANA_DB_CHAIN_ID[cluster],
  tokenDecimals: integer(
    "SOLANA_TOKEN_DECIMALS",
    PUMP_FEEL_DEFAULTS.tokenDecimals
  ),
  factoryProgramId:
    optional("SOLANA_FACTORY_PROGRAM_ID") ?? PROGRAM_IDS.factory,
  curveProgramId: optional("SOLANA_CURVE_PROGRAM_ID") ?? PROGRAM_IDS.curve,
  treasuryProgramId:
    optional("SOLANA_TREASURY_PROGRAM_ID") ?? PROGRAM_IDS.treasury,
  stateKey: optional("SOLANA_INDEXER_STATE_KEY") ?? "solana_indexer",
  startSlot: BigInt(integer("SOLANA_INDEXER_START_SLOT", 0)),
  pollIntervalMs: integer("SOLANA_INDEXER_POLL_MS", 2_000),
  once: process.env.SOLANA_INDEXER_ONCE === "1",
  source,
  laserstreamEndpoint: optional("HELIUS_LASERSTREAM_ENDPOINT"),
  heliusApiKey: optional("HELIUS_API_KEY"),
};

/**
 * Solana runtime config for web (pump.fun-feel defaults + env overrides).
 * @see docs/solana-port.md
 */
import {
  DEFAULT_CLUSTER,
  NATIVE_SYMBOL,
  PROGRAM_IDS,
  PUMP_FEEL_DEFAULTS,
  resolveSolanaCluster,
  resolveSolanaRpcUrl,
  shortSolanaAddress,
  type SolanaCluster,
} from "@pump/solana-sdk";

export {
  PUMP_FEEL_DEFAULTS,
  NATIVE_SYMBOL,
  PROGRAM_IDS,
  shortSolanaAddress,
  type SolanaCluster,
};

export const SOLANA_CLUSTER: SolanaCluster = resolveSolanaCluster(
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER
);

export const SOLANA_RPC_URL = resolveSolanaRpcUrl({
  cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? DEFAULT_CLUSTER,
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
});

export const SOLANA_PROGRAM_IDS = {
  factory:
    process.env.NEXT_PUBLIC_SOLANA_FACTORY_PROGRAM_ID?.trim() || PROGRAM_IDS.factory,
  curve: process.env.NEXT_PUBLIC_SOLANA_CURVE_PROGRAM_ID?.trim() || PROGRAM_IDS.curve,
  treasury:
    process.env.NEXT_PUBLIC_SOLANA_TREASURY_PROGRAM_ID?.trim() || PROGRAM_IDS.treasury,
} as const;

import { isSolanaChainFamily } from "@/config/chain-family";
import { SOLANA_DB_CHAIN_ID, resolveSolanaCluster } from "@pump/solana-sdk";

/** Active launchpad chain_id for DB filters (Solana production). */
export function activeLaunchpadChainId(): number | null {
  if (!isSolanaChainFamily) return null;
  const cluster = resolveSolanaCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
  return SOLANA_DB_CHAIN_ID[cluster];
}

/** SQL fragment: `AND t.chain_id = 901103` when Solana family. */
export function sqlChainFilter(tableAlias = "t"): string {
  const chainId = activeLaunchpadChainId();
  if (chainId == null) return "";
  return `AND ${tableAlias}.chain_id = ${chainId}`;
}

/** Solana virtual SOL reserve (human) for board-stats SQL fallbacks. */
export const SOLANA_VIRTUAL_SOL_HUMAN = 30;

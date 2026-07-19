/**
 * Chain family switch.
 * Production VM: deploy scripts set NEXT_PUBLIC_CHAIN_FAMILY=solana before build.
 * Local: set in .env (default in .env.example = solana).
 *
 * @see docs/solana-port.md
 */
export type ChainFamily = "evm" | "solana";

function resolveChainFamily(raw: string | undefined | null): ChainFamily {
  const v = (raw ?? "solana").trim().toLowerCase();
  if (v === "evm") return "evm";
  if (v === "solana" || v === "svm") return "solana";
  return "solana";
}

/** Active product chain family. Unset → solana (production cutover). */
export const CHAIN_FAMILY: ChainFamily = resolveChainFamily(
  process.env.NEXT_PUBLIC_CHAIN_FAMILY
);

export const isEvmChainFamily = CHAIN_FAMILY === "evm";
export const isSolanaChainFamily = CHAIN_FAMILY === "solana";

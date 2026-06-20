import { parseGwei } from "viem";
import { getBundlerRpcUrl } from "@/lib/aa/bundler-config";

/** BSC mainnet priority fee is ~0.1 gwei (2026). Legacy 1 gwei floors overcharged users ~10×. */
export const MIN_USER_OP_MAX_FEE = parseGwei("0.1");
export const MIN_USER_OP_PRIORITY_FEE = parseGwei("0.1");

type GasTier = { maxFeePerGas: string; maxPriorityFeePerGas: string };
type PimlicoGasTiers = { slow: GasTier; standard: GasTier; fast: GasTier };

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function clampUserOpFees(maxFeePerGas: bigint, maxPriorityFeePerGas: bigint) {
  const priority = maxBigInt(maxPriorityFeePerGas, MIN_USER_OP_PRIORITY_FEE);
  const maxFee = maxBigInt(maxFeePerGas, maxBigInt(priority, MIN_USER_OP_MAX_FEE));
  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority };
}

function clampGasTier(tier: GasTier) {
  return clampUserOpFees(BigInt(tier.maxFeePerGas), BigInt(tier.maxPriorityFeePerGas));
}

/** Pimlico-recommended gas for UserOps (via bundler proxy). */
export async function fetchPimlicoUserOpGasPrice(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
} | null> {
  const response = await fetch(getBundlerRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "pimlico_getUserOperationGasPrice",
      params: [],
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    result?: PimlicoGasTiers;
    error?: { message?: string };
  };

  const tier = payload.result?.standard ?? payload.result?.fast ?? payload.result?.slow;
  if (!tier) return null;

  return clampGasTier(tier);
}

function feesFromChainGasPrice(gasPrice: bigint) {
  const priority = maxBigInt(gasPrice, MIN_USER_OP_PRIORITY_FEE);
  return clampUserOpFees(gasPrice, priority);
}

export async function resolveUserOpGasPrice(
  chainGasPrice: () => Promise<bigint>
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  let chainFees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | null = null;

  try {
    const gasPrice = await chainGasPrice();
    if (gasPrice > 0n) {
      chainFees = feesFromChainGasPrice(gasPrice);
    }
  } catch {
    // fall through to bundler tiers
  }

  const bundler = await fetchPimlicoUserOpGasPrice().catch(() => null);

  if (chainFees && bundler) {
    return clampUserOpFees(
      minBigInt(chainFees.maxFeePerGas, bundler.maxFeePerGas),
      minBigInt(chainFees.maxPriorityFeePerGas, bundler.maxPriorityFeePerGas)
    );
  }

  if (chainFees) return chainFees;
  if (bundler) return bundler;

  return {
    maxFeePerGas: MIN_USER_OP_MAX_FEE,
    maxPriorityFeePerGas: MIN_USER_OP_PRIORITY_FEE,
  };
}

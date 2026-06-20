import { parseGwei } from "viem";
import { getBundlerRpcUrl } from "@/lib/aa/bundler-config";

/** Pimlico bundlers reject UserOps below 1 gwei priority fee on BSC. */
export const MIN_USER_OP_MAX_FEE = parseGwei("1");
export const MIN_USER_OP_PRIORITY_FEE = parseGwei("1");

type GasTier = { maxFeePerGas: string; maxPriorityFeePerGas: string };
type PimlicoGasTiers = { slow: GasTier; standard: GasTier; fast: GasTier };

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function clampGasTier(tier: GasTier) {
  return {
    maxFeePerGas: maxBigInt(BigInt(tier.maxFeePerGas), MIN_USER_OP_MAX_FEE),
    maxPriorityFeePerGas: maxBigInt(
      BigInt(tier.maxPriorityFeePerGas),
      MIN_USER_OP_PRIORITY_FEE
    ),
  };
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

export async function resolveUserOpGasPrice(
  chainGasPrice: () => Promise<bigint>
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const pimlico = await fetchPimlicoUserOpGasPrice().catch(() => null);
  if (pimlico) return pimlico;

  const gasPrice = await chainGasPrice();
  return {
    maxFeePerGas: maxBigInt(gasPrice, MIN_USER_OP_MAX_FEE),
    maxPriorityFeePerGas: maxBigInt(gasPrice, MIN_USER_OP_PRIORITY_FEE),
  };
}

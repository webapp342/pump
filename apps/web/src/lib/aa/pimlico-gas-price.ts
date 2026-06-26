import { parseGwei } from "viem";
import { CHAIN_ID } from "@/config/chain";
import { getBundlerRpcUrl } from "@/lib/aa/bundler-config";

/** BSC — bundler min priority ~0.1 gwei (2026). */
export const MIN_USER_OP_MAX_FEE_BSC = parseGwei("0.1");
export const MIN_USER_OP_PRIORITY_FEE_BSC = parseGwei("0.1");

/** Base L2 — base fee is often ~0.001–0.01 gwei; 0.1 gwei floor overcharges ~10–20×. */
export const MIN_USER_OP_MAX_FEE_BASE = parseGwei("0.001");
export const MIN_USER_OP_PRIORITY_FEE_BASE = parseGwei("0.001");

/** @deprecated Use chain-aware floors via getUserOpFeeFloors(). Kept for tests/imports. */
export const MIN_USER_OP_MAX_FEE = MIN_USER_OP_MAX_FEE_BSC;
/** @deprecated Use chain-aware floors via getUserOpFeeFloors(). Kept for tests/imports. */
export const MIN_USER_OP_PRIORITY_FEE = MIN_USER_OP_PRIORITY_FEE_BSC;

const BASE_CHAIN_IDS = new Set([8453, 84532]);

/** +20% maxFee headroom on top of base + priority (UserOp inclusion slack). */
const USER_OP_MAX_FEE_HEADROOM_NUM = 12n;
const USER_OP_MAX_FEE_HEADROOM_DEN = 10n;

type GasTier = { maxFeePerGas: string; maxPriorityFeePerGas: string };
type PimlicoGasTiers = { slow: GasTier; standard: GasTier; fast: GasTier };

export type UserOpGasFees = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function isBaseChain(chainId: number = CHAIN_ID): boolean {
  return BASE_CHAIN_IDS.has(chainId);
}

export function getUserOpFeeFloors(chainId: number = CHAIN_ID): {
  minMaxFee: bigint;
  minPriority: bigint;
} {
  if (isBaseChain(chainId)) {
    return {
      minMaxFee: MIN_USER_OP_MAX_FEE_BASE,
      minPriority: MIN_USER_OP_PRIORITY_FEE_BASE,
    };
  }
  return {
    minMaxFee: MIN_USER_OP_MAX_FEE_BSC,
    minPriority: MIN_USER_OP_PRIORITY_FEE_BSC,
  };
}

function clampUserOpFees(maxFeePerGas: bigint, maxPriorityFeePerGas: bigint): UserOpGasFees {
  const { minMaxFee, minPriority } = getUserOpFeeFloors();
  const priority = maxBigInt(maxPriorityFeePerGas, minPriority);
  const maxFee = maxBigInt(maxFeePerGas, maxBigInt(priority, minMaxFee));
  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority };
}

function clampGasTier(tier: GasTier): UserOpGasFees {
  return clampUserOpFees(BigInt(tier.maxFeePerGas), BigInt(tier.maxPriorityFeePerGas));
}

type GasTierPreference = "standard" | "fast";

/** Pimlico-recommended gas for UserOps (via bundler proxy / Alto). */
export async function fetchPimlicoUserOpGasPrice(
  preference: GasTierPreference = "standard"
): Promise<UserOpGasFees | null> {
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

  const tiers = payload.result;
  if (!tiers) return null;

  const tier =
    preference === "fast"
      ? (tiers.fast ?? tiers.standard ?? tiers.slow)
      : (tiers.standard ?? tiers.fast ?? tiers.slow);
  if (!tier) return null;

  return clampGasTier(tier);
}

/**
 * Live chain gas → UserOp maxFeePerGas / maxPriorityFeePerGas.
 * Base: eth_gasPrice ≈ base fee; small priority tip + headroom (not BSC 0.1 gwei floor).
 */
export function feesFromChainGasPrice(gasPrice: bigint): UserOpGasFees {
  if (gasPrice <= 0n) {
    const { minMaxFee, minPriority } = getUserOpFeeFloors();
    return { maxFeePerGas: minMaxFee, maxPriorityFeePerGas: minPriority };
  }

  if (isBaseChain()) {
    const { minPriority } = getUserOpFeeFloors();
    const priority = minPriority;
    const maxFee =
      ((gasPrice + priority) * USER_OP_MAX_FEE_HEADROOM_NUM) / USER_OP_MAX_FEE_HEADROOM_DEN;
    return clampUserOpFees(maxFee, priority);
  }

  const { minPriority } = getUserOpFeeFloors();
  const priority = maxBigInt(gasPrice, minPriority);
  return clampUserOpFees(gasPrice, priority);
}

/** Prefer chain when cheaper (Base L2); bundler tier is ceiling, not floor. */
function mergeChainAndBundlerFees(chainFees: UserOpGasFees, bundler: UserOpGasFees): UserOpGasFees {
  if (chainFees.maxFeePerGas <= bundler.maxFeePerGas) {
    return clampUserOpFees(chainFees.maxFeePerGas, chainFees.maxPriorityFeePerGas);
  }
  return clampUserOpFees(bundler.maxFeePerGas, bundler.maxPriorityFeePerGas);
}

async function resolveUserOpGasPriceWithPreference(
  chainGasPrice: () => Promise<bigint>,
  preference: GasTierPreference
): Promise<UserOpGasFees> {
  const [chainFees, bundler] = await Promise.all([
    chainGasPrice()
      .then((gasPrice) => (gasPrice > 0n ? feesFromChainGasPrice(gasPrice) : null))
      .catch(() => null),
    fetchPimlicoUserOpGasPrice(preference).catch(() => null),
  ]);

  if (chainFees && bundler) {
    return mergeChainAndBundlerFees(chainFees, bundler);
  }

  if (chainFees) return chainFees;
  if (bundler) return bundler;

  const { minMaxFee, minPriority } = getUserOpFeeFloors();
  return { maxFeePerGas: minMaxFee, maxPriorityFeePerGas: minPriority };
}

export async function resolveUserOpGasPrice(
  chainGasPrice: () => Promise<bigint>
): Promise<UserOpGasFees> {
  return resolveUserOpGasPriceWithPreference(chainGasPrice, "standard");
}

/** Buy/sell — Base uses standard tier; BSC uses fast for executor inclusion. */
export async function resolveTradeUserOpGasPrice(
  chainGasPrice: () => Promise<bigint>
): Promise<UserOpGasFees> {
  const preference: GasTierPreference = isBaseChain() ? "standard" : "fast";
  return resolveUserOpGasPriceWithPreference(chainGasPrice, preference);
}

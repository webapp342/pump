import { createPublicClient, formatUnits, http, type Address } from "viem";
import { erc20Abi } from "@/lib/abis/erc20";
import { memeTokenAbi } from "@/lib/abis/meme-token";
import { contracts, pumpChain, rpcUrl } from "@/config/chain";
import {
  bondingCurveManagerAbi,
  bondingCurveStateFromTuple,
  minOutWithSlippage,
  quoteSellFromCurveState,
} from "@/lib/bonding-curve";
import { ON_CHAIN_BALANCE_EPSILON } from "@/lib/onchain-balance";

const publicClient = createPublicClient({
  chain: pumpChain,
  transport: http(rpcUrl, { timeout: 20_000 }),
});

const MULTICALL_CHUNK = 40;

export type BatchSellHoldingInput = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
};

export type PreparedBatchSellTarget = BatchSellHoldingInput & {
  tokenIn: string;
  minZugOut: string;
  estimatedZugOut: string;
  /** Existing ERC20 allowance covers the sell — no permit signature. */
  hasAllowance: boolean;
  supportsPermit: boolean;
  tokenName?: string;
  permitNonce?: string;
};

export type PrepareBatchSellResult = {
  targets: PreparedBatchSellTarget[];
  skipped: number;
  allowanceReadyCount: number;
  permitNeededCount: number;
};

type CurveTuple = readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, boolean];

export async function prepareBatchSellTargets(
  walletAddress: string,
  holdings: BatchSellHoldingInput[]
): Promise<PrepareBatchSellResult> {
  const wallet = walletAddress.toLowerCase() as Address;
  const unique = new Map<string, BatchSellHoldingInput>();
  for (const holding of holdings) {
    unique.set(holding.tokenAddress.toLowerCase(), holding);
  }
  const list = [...unique.values()];
  if (list.length === 0) {
    return { targets: [], skipped: 0, allowanceReadyCount: 0, permitNeededCount: 0 };
  }

  const protocolFeeBps = await publicClient.readContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "protocolFeeBps",
  });

  const targets: PreparedBatchSellTarget[] = [];
  let skipped = 0;

  for (let i = 0; i < list.length; i += MULTICALL_CHUNK) {
    const chunk = list.slice(i, i + MULTICALL_CHUNK);
    const tokenAddresses = chunk.map((holding) => holding.tokenAddress.toLowerCase() as Address);

    const balanceContracts = tokenAddresses.map((tokenAddress) => ({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [wallet] as const,
    }));
    const curveContracts = tokenAddresses.map((tokenAddress) => ({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "curves" as const,
      args: [tokenAddress] as const,
    }));
    const nonceContracts = tokenAddresses.map((tokenAddress) => ({
      address: tokenAddress,
      abi: memeTokenAbi,
      functionName: "nonces" as const,
      args: [wallet] as const,
    }));
    const nameContracts = tokenAddresses.map((tokenAddress) => ({
      address: tokenAddress,
      abi: memeTokenAbi,
      functionName: "name" as const,
    }));

    const allowanceContracts = tokenAddresses.map((tokenAddress) => ({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "allowance" as const,
      args: [wallet, contracts.bondingCurveManager] as const,
    }));

    const [balanceResults, curveResults, allowanceResults, nonceResults, nameResults] =
      await Promise.all([
      publicClient.multicall({ allowFailure: true, contracts: balanceContracts }),
      publicClient.multicall({ allowFailure: true, contracts: curveContracts }),
      publicClient.multicall({ allowFailure: true, contracts: allowanceContracts }),
      publicClient.multicall({ allowFailure: true, contracts: nonceContracts }),
      publicClient.multicall({ allowFailure: true, contracts: nameContracts }),
    ]);

    chunk.forEach((holding, index) => {
      const balanceResult = balanceResults[index];
      const curveResult = curveResults[index];
      const allowanceResult = allowanceResults[index];
      const nonceResult = nonceResults[index];
      const nameResult = nameResults[index];

      if (balanceResult?.status !== "success" || curveResult?.status !== "success") {
        skipped += 1;
        return;
      }

      const tokenIn = balanceResult.result;
      const balance = Number(formatUnits(tokenIn, 18));
      if (!Number.isFinite(balance) || balance <= ON_CHAIN_BALANCE_EPSILON) {
        skipped += 1;
        return;
      }

      const curveTuple = curveResult.result as CurveTuple;
      if (curveTuple[7]) {
        skipped += 1;
        return;
      }

      const curve = bondingCurveStateFromTuple(curveTuple);
      const { zugOut } = quoteSellFromCurveState(curve, protocolFeeBps, tokenIn);
      if (zugOut <= 0n) {
        skipped += 1;
        return;
      }

      const supportsPermit =
        nonceResult?.status === "success" && nameResult?.status === "success";
      const allowance =
        allowanceResult?.status === "success" ? allowanceResult.result : 0n;
      const hasAllowance = allowance >= tokenIn;

      if (!hasAllowance && !supportsPermit) {
        skipped += 1;
        return;
      }

      targets.push({
        ...holding,
        tokenAddress: holding.tokenAddress.toLowerCase(),
        tokenIn: tokenIn.toString(),
        minZugOut: minOutWithSlippage(zugOut).toString(),
        estimatedZugOut: zugOut.toString(),
        hasAllowance,
        supportsPermit,
        tokenName: nameResult?.status === "success" ? nameResult.result : undefined,
        permitNonce:
          nonceResult?.status === "success" ? nonceResult.result.toString() : undefined,
      });
    });
  }

  targets.sort((a, b) => Number(b.estimatedZugOut) - Number(a.estimatedZugOut));
  const allowanceReadyCount = targets.filter((target) => target.hasAllowance).length;
  const permitNeededCount = targets.length - allowanceReadyCount;
  return { targets, skipped, allowanceReadyCount, permitNeededCount };
}

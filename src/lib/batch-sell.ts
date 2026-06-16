import type { Address } from "viem";
import { parseSignature } from "viem";
import { buildPermitTypedData, PERMIT_ALLOWANCE_MAX, permitDeadline } from "@/lib/erc20-permit";

export const MAX_SELL_BATCH = 10;
/** Parallel permit signatures per wave when preparing sell-all. */
export const PERMIT_SIGN_WAVE_SIZE = 25;

export type BatchSellPermitTarget = {
  tokenAddress: string;
  symbol: string;
  tokenName: string;
  tokenIn: string;
  minZugOut: string;
  permitNonce: string;
};

export function chunkBatchSellItems<T>(items: T[], size = MAX_SELL_BATCH): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** Split into allowance-ready batches first, then permit batches — never mixed in one tx. */
export function buildSellBatchQueue<T extends { hasAllowance: boolean }>(
  targets: T[],
  size = MAX_SELL_BATCH
): T[][] {
  const allowanceReady = targets.filter((target) => target.hasAllowance);
  const permitNeeded = targets.filter((target) => !target.hasAllowance);
  return [...chunkBatchSellItems(allowanceReady, size), ...chunkBatchSellItems(permitNeeded, size)];
}

export function batchSellItemFromTarget(target: {
  tokenAddress: string;
  tokenIn: string;
  minZugOut: string;
}): BatchSellItem {
  return {
    tokenAddress: target.tokenAddress as Address,
    tokenIn: BigInt(target.tokenIn),
    minZugOut: BigInt(target.minZugOut),
  };
}

export type BatchSellItem = {
  tokenAddress: Address;
  tokenIn: bigint;
  minZugOut: bigint;
  permit?: {
    deadline: bigint;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  };
};

type PermitSignInput = {
  tokenName: string;
  tokenAddress: Address;
  tokenIn: bigint;
  minZugOut: bigint;
  permitNonce: bigint;
  owner: Address;
  spender: Address;
  chainId: number;
  deadline?: bigint;
  signTypedDataAsync: (args: ReturnType<typeof buildPermitTypedData>) => Promise<`0x${string}`>;
};

export async function signBatchSellPermitItem(
  input: PermitSignInput
): Promise<BatchSellItem> {
  const deadline = input.deadline ?? permitDeadline();
  const signature = await input.signTypedDataAsync(
    buildPermitTypedData({
      tokenName: input.tokenName,
      tokenAddress: input.tokenAddress,
      chainId: input.chainId,
      owner: input.owner,
      spender: input.spender,
      value: PERMIT_ALLOWANCE_MAX,
      nonce: input.permitNonce,
      deadline,
    })
  );
  const parsed = parseSignature(signature);
  const permitV =
    parsed.yParity !== undefined ? parsed.yParity + 27 : Number(parsed.v ?? 27);

  return {
    tokenAddress: input.tokenAddress,
    tokenIn: input.tokenIn,
    minZugOut: input.minZugOut,
    permit: {
      deadline,
      v: permitV,
      r: parsed.r,
      s: parsed.s,
    },
  };
}

/** Sign permits not already in `existing` (parallel waves). */
export async function signAllBatchSellPermits(
  targets: BatchSellPermitTarget[],
  input: {
    owner: Address;
    spender: Address;
    chainId: number;
    signTypedDataAsync: PermitSignInput["signTypedDataAsync"];
    onProgress?: (signed: number, total: number) => void;
  },
  existing: Map<string, BatchSellItem> = new Map()
): Promise<Map<string, BatchSellItem>> {
  const signed = new Map(existing);
  const toSign = targets.filter((target) => !signed.has(target.tokenAddress.toLowerCase()));
  if (toSign.length === 0) return signed;

  const deadline = permitDeadline();
  const total = toSign.length;
  let completed = 0;

  for (let offset = 0; offset < toSign.length; offset += PERMIT_SIGN_WAVE_SIZE) {
    const wave = toSign.slice(offset, offset + PERMIT_SIGN_WAVE_SIZE);
    const waveItems = await Promise.all(
      wave.map(async (target) => {
        const item = await signBatchSellPermitItem({
          tokenName: target.tokenName,
          tokenAddress: target.tokenAddress as Address,
          tokenIn: BigInt(target.tokenIn),
          minZugOut: BigInt(target.minZugOut),
          permitNonce: BigInt(target.permitNonce),
          owner: input.owner,
          spender: input.spender,
          chainId: input.chainId,
          deadline,
          signTypedDataAsync: input.signTypedDataAsync,
        });
        return [target.tokenAddress.toLowerCase(), item] as const;
      })
    );

    for (const [tokenAddress, item] of waveItems) {
      signed.set(tokenAddress, item);
    }
    completed = Math.min(offset + wave.length, total);
    input.onProgress?.(completed, total);
  }

  return signed;
}

export function batchItemsForSellBatch(
  batch: Array<{
    tokenAddress: string;
    tokenIn: string;
    minZugOut: string;
    hasAllowance: boolean;
  }>,
  signedPermits: Map<string, BatchSellItem>
): BatchSellItem[] {
  return batch.map((target) => {
    if (target.hasAllowance) {
      return batchSellItemFromTarget(target);
    }

    const cached = signedPermits.get(target.tokenAddress.toLowerCase());
    if (!cached?.permit) {
      throw new Error("Missing permit signature. Sign permits first.");
    }

    return {
      tokenAddress: cached.tokenAddress,
      tokenIn: BigInt(target.tokenIn),
      minZugOut: BigInt(target.minZugOut),
      permit: cached.permit,
    };
  });
}

export function batchSellWriteArgs(items: BatchSellItem[]) {
  const needsPermit = items.some((item) => item.permit);
  if (needsPermit) {
    return {
      functionName: "sellBatchWithPermit" as const,
      args: [
        items.map((item) => ({
          token: item.tokenAddress,
          tokenIn: item.tokenIn,
          minZugOut: item.minZugOut,
          deadline: item.permit!.deadline,
          v: item.permit!.v,
          r: item.permit!.r,
          s: item.permit!.s,
        })),
      ],
    };
  }

  return {
    functionName: "sellBatch" as const,
    args: [
      items.map((item) => ({
        token: item.tokenAddress,
        tokenIn: item.tokenIn,
        minZugOut: item.minZugOut,
      })),
    ],
  };
}

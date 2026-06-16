import type { Address } from "viem";
import { pumpChain } from "@/config/chain";
import type { BatchSellItem } from "@/lib/batch-sell";
import type { PreparedBatchSellTarget } from "@/lib/batch-sell-prepare";

const STORAGE_KEY = "pump-batch-sell-permits";

export type StoredBatchSellPermit = {
  tokenAddress: string;
  tokenIn: string;
  minZugOut: string;
  permitNonce: string;
  deadline: string;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
};

type BatchSellPermitCacheFile = {
  wallet: string;
  chainId: number;
  permits: Record<string, StoredBatchSellPermit>;
};

function cacheKey(wallet: string, chainId: number): string {
  return `${wallet.toLowerCase()}:${chainId}`;
}

function readCacheFile(): BatchSellPermitCacheFile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BatchSellPermitCacheFile;
    if (!parsed.wallet || !parsed.permits || typeof parsed.chainId !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCacheFile(file: BatchSellPermitCacheFile | null): void {
  if (typeof window === "undefined") return;
  if (!file || Object.keys(file.permits).length === 0) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}

export function storedPermitToBatchItem(
  stored: StoredBatchSellPermit,
  target: { tokenIn: string; minZugOut: string }
): BatchSellItem {
  return {
    tokenAddress: stored.tokenAddress as Address,
    tokenIn: BigInt(target.tokenIn),
    minZugOut: BigInt(target.minZugOut),
    permit: {
      deadline: BigInt(stored.deadline),
      v: stored.v,
      r: stored.r,
      s: stored.s,
    },
  };
}

export function batchItemToStoredPermit(
  item: BatchSellItem,
  permitNonce: string
): StoredBatchSellPermit {
  if (!item.permit) {
    throw new Error("Cannot store allowance-only batch item as permit.");
  }

  return {
    tokenAddress: item.tokenAddress.toLowerCase(),
    tokenIn: item.tokenIn.toString(),
    minZugOut: item.minZugOut.toString(),
    permitNonce,
    deadline: item.permit.deadline.toString(),
    v: item.permit.v,
    r: item.permit.r,
    s: item.permit.s,
  };
}

export function storedPermitMatchesTarget(
  stored: StoredBatchSellPermit,
  target: PreparedBatchSellTarget
): boolean {
  if (!target.permitNonce) return false;
  if (stored.permitNonce !== target.permitNonce) return false;
  if (stored.tokenIn !== target.tokenIn) return false;
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(stored.deadline) <= now) return false;
  return true;
}

export function restorePermitsForTargets(
  wallet: string,
  chainId: number,
  targets: PreparedBatchSellTarget[]
): {
  restored: Map<string, BatchSellItem>;
  missing: PreparedBatchSellTarget[];
} {
  const restored = new Map<string, BatchSellItem>();
  const missing: PreparedBatchSellTarget[] = [];
  const file = readCacheFile();
  const walletKey = cacheKey(wallet, chainId);

  if (!file || cacheKey(file.wallet, file.chainId) !== walletKey) {
    return { restored, missing: targets.filter((target) => !target.hasAllowance) };
  }

  for (const target of targets) {
    if (target.hasAllowance) continue;

    const stored = file.permits[target.tokenAddress.toLowerCase()];
    if (stored && storedPermitMatchesTarget(stored, target)) {
      restored.set(
        target.tokenAddress.toLowerCase(),
        storedPermitToBatchItem(stored, target)
      );
      continue;
    }

    missing.push(target);
  }

  return { restored, missing };
}

export function persistPermitCache(
  wallet: string,
  chainId: number,
  permits: Map<string, BatchSellItem>,
  permitNonces: Record<string, string>
): void {
  const file = readCacheFile();
  const walletKey = cacheKey(wallet, chainId);
  const next: BatchSellPermitCacheFile =
    file && cacheKey(file.wallet, file.chainId) === walletKey
      ? { ...file, permits: { ...file.permits } }
      : { wallet: wallet.toLowerCase(), chainId, permits: {} };

  for (const [tokenAddress, item] of permits) {
    if (!item.permit) continue;
    const nonce = permitNonces[tokenAddress];
    if (!nonce) continue;
    next.permits[tokenAddress] = batchItemToStoredPermit(item, nonce);
  }

  writeCacheFile(next);
}

export function removePermitsFromCache(wallet: string, chainId: number, tokenAddresses: string[]): void {
  const file = readCacheFile();
  if (!file || cacheKey(file.wallet, file.chainId) !== cacheKey(wallet, chainId)) return;

  for (const tokenAddress of tokenAddresses) {
    delete file.permits[tokenAddress.toLowerCase()];
  }

  writeCacheFile(file);
}

export function clearPermitCache(wallet: string, chainId: number = pumpChain.id): void {
  const file = readCacheFile();
  if (!file || cacheKey(file.wallet, file.chainId) !== cacheKey(wallet, chainId)) return;
  writeCacheFile(null);
}

export function countCachedPermitsForTargets(
  wallet: string,
  chainId: number,
  targets: PreparedBatchSellTarget[]
): number {
  const { restored } = restorePermitsForTargets(wallet, chainId, targets);
  return restored.size;
}

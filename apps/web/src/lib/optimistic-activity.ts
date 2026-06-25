import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import { DEFAULT_STARTING_SPOT_PRICE_BNB } from "@/lib/bonding-curve";
import { EMPTY_SOCIAL_LINKS, type TokenSocialLinks } from "@/lib/token-social";

export const MISSION_KEYS = {
  deployMeme: "LAUNCHPAD_DEPLOY_MEME",
  dailySwap: "LAUNCHPAD_DAILY_SWAP",
} as const;

export type OptimisticActivity = {
  txHash: string;
  type: "create" | "buy" | "sell";
  at: string;
  tokenAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDescription?: string;
  socialLinks?: TokenSocialLinks;
  creatorAddress?: string;
  /** Base64/data URL for logo preview before upload indexes. */
  logoPreviewUrl?: string;
  missionKeys?: string[];
};

const STORAGE_KEY = "pump_optimistic_activity";
const MAX_AGE_MS = 10 * 60 * 1000;

function readAll(): OptimisticActivity[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OptimisticActivity[];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter((item) => new Date(item.at).getTime() >= cutoff);
  } catch {
    return [];
  }
}

function writeAll(items: OptimisticActivity[]): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function pushOptimisticActivity(activity: OptimisticActivity): void {
  const items = readAll().filter(
    (item) => item.txHash.toLowerCase() !== activity.txHash.toLowerCase()
  );
  items.unshift(activity);
  writeAll(items.slice(0, 20));
  window.dispatchEvent(new CustomEvent("pump:activity", { detail: activity }));
}

export function listRecentOptimisticActivities(maxAgeMs = MAX_AGE_MS): OptimisticActivity[] {
  const cutoff = Date.now() - maxAgeMs;
  return readAll().filter((item) => new Date(item.at).getTime() >= cutoff);
}

/** Drop activities once indexer / DB has the trade (stops refresh re-hydrate). */
export function removeOptimisticActivities(txHashes: string[]): void {
  if (txHashes.length === 0) return;
  const drop = new Set(txHashes.map((h) => h.toLowerCase()));
  const next = readAll().filter((item) => !drop.has(item.txHash.toLowerCase()));
  if (next.length === readAll().length) return;
  writeAll(next);
}

export function listPendingMissionKeys(): string[] {
  const keys = new Set<string>();
  for (const activity of listRecentOptimisticActivities()) {
    for (const key of activity.missionKeys ?? []) {
      keys.add(key);
    }
  }
  return [...keys];
}

export function getPendingCreateForToken(tokenAddress: string): OptimisticActivity | null {
  const normalized = tokenAddress.toLowerCase();
  return (
    listRecentOptimisticActivities().find(
      (item) =>
        item.type === "create" &&
        item.tokenAddress?.toLowerCase() === normalized
    ) ?? null
  );
}

export function buildOptimisticTokenDetail(
  tokenAddress: string,
  activity: OptimisticActivity
): TokenDetail {
  return {
    address: tokenAddress.toLowerCase(),
    symbol: activity.tokenSymbol ?? "NEW",
    name: activity.tokenName ?? "New meme",
    creatorAddress: activity.creatorAddress?.toLowerCase() ?? "",
    status: "BONDING",
    launchBlockNumber: "0",
    createdAt: activity.at,
    progressBps: 0,
    reserveBnb: "0",
    marketCapBnb: "0",
    holderCount: 1,
    description: activity.tokenDescription ?? null,
    socialLinks: activity.socialLinks ?? EMPTY_SOCIAL_LINKS,
    logoUrl: activity.logoPreviewUrl ?? null,
    launchTxHash: activity.txHash.toLowerCase(),
    creatorFollowerCount: 0,
    targetBnb: "0",
    tokenSold: "0",
    tradeCount: 0,
    lastPriceBnb: DEFAULT_STARTING_SPOT_PRICE_BNB.toString(),
  };
}

export function mergeTrades(dbTrades: TradeItem[], optimisticTrades: TradeItem[]): TradeItem[] {
  const dbHashes = new Set(dbTrades.map((t) => t.txHash.toLowerCase()));
  const pending = optimisticTrades.filter((t) => !dbHashes.has(t.txHash.toLowerCase()));
  const merged = [...pending, ...dbTrades];
  merged.sort((a, b) => new Date(b.blockTime).getTime() - new Date(a.blockTime).getTime());
  return merged;
}

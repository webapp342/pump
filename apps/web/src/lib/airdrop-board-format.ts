import { parseEther, formatEther } from "viem";
import { NATIVE_SYMBOL } from "@/config/chain";
import { rewardAmountForRank } from "@/lib/airdrop-distribution";
import type { AirdropDisplayStatus } from "@/lib/airdrop-status";
import { bnbToUsd } from "@/lib/format-usd";

type AirdropRewardMeta = {
  rewardToken: string | null;
  rewardSymbol?: string | null;
  rewardPriceBnb?: string | null;
  totalFunded: string;
};

export function rewardAssetLabel(item: Pick<AirdropRewardMeta, "rewardToken" | "rewardSymbol">): string {
  if (!item.rewardToken) return NATIVE_SYMBOL;
  return item.rewardSymbol ? `$${item.rewardSymbol}` : "Token";
}

export function airdropRewardUsd(
  item: AirdropRewardMeta,
  bnbUsd: number | null | undefined
): number | null {
  const amount = Number(item.totalFunded);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  // Token rewards: amount × price-in-BNB × BNB/USD (pairs trade against BNB).
  if (!item.rewardToken) return bnbToUsd(amount, bnbUsd);
  const priceBnb = Number(item.rewardPriceBnb);
  if (!Number.isFinite(priceBnb) || priceBnb <= 0 || bnbUsd == null) return null;
  return amount * priceBnb * bnbUsd;
}

/** Max fractional digits for sub-K/M/B reward amounts (board + create preview). */
export const AIRDROP_REWARD_MAX_DECIMALS = 4;

const WEI_PER_ETHER = 10n ** 18n;

/** Floor wei to input precision so parseEther(input) never exceeds the wallet balance. */
export function floorCampaignAmountWei(wei: bigint): bigint {
  if (wei <= 0n) return 0n;
  const truncFactor = WEI_PER_ETHER / 10n ** BigInt(AIRDROP_REWARD_MAX_DECIMALS);
  return (wei / truncFactor) * truncFactor;
}

export function formatAirdropReward(
  value: string,
  opts: { isBnb: boolean; symbol?: string | null }
): string {
  const compact = formatAirdropRewardCompact(value);
  if (opts.isBnb) return `${compact} ${NATIVE_SYMBOL}`;
  if (opts.symbol) return `${compact} ${opts.symbol}`;
  return `${compact} tokens`;
}

export function formatAirdropRewardCompact(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return typeof value === "string" ? value : "—";
  if (n <= 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return trimTrailingZeros(n.toFixed(AIRDROP_REWARD_MAX_DECIMALS));
}

function trimTrailingZeros(formatted: string): string {
  if (!formatted.includes(".")) return formatted;
  return formatted.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** Human-readable BNB / token amount from wei (create campaign UI). Matches board display. */
export function formatCampaignAmount(wei: bigint): string {
  const n = Number(formatEther(wei));
  if (!Number.isFinite(n) || n <= 0) return "0";
  return formatAirdropRewardCompact(n);
}

/** Parseable decimal for amount inputs + sliders (never K/M/B compact). */
export function formatCampaignAmountInput(wei: bigint): string {
  const floored = floorCampaignAmountWei(wei);
  if (floored <= 0n) return "0";
  return trimTrailingZeros(formatEther(floored));
}

export function formatCampaignAmountLabel(wei: bigint, assetLabel: string): string {
  return `${formatCampaignAmount(wei)} ${assetLabel}`;
}

/** Adaptive countdown: ≥1w → w d [h], ≥1d → d h [m], ≥1h → h m, else m s. */
export function formatCountdownMs(ms: number, maxParts = 3): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";

  const totalSec = Math.floor(ms / 1000);
  const weeks = Math.floor(totalSec / (7 * 24 * 3600));
  const days = Math.floor((totalSec % (7 * 24 * 3600)) / (24 * 3600));
  const hours = Math.floor((totalSec % (24 * 3600)) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const cap = (parts: string[]) => parts.slice(0, maxParts).join(" ");

  if (weeks > 0) {
    const parts = [`${weeks}w`];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    return cap(parts);
  }

  if (days > 0) {
    const parts = [`${days}d`];
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    return cap(parts);
  }

  if (hours > 0) {
    const parts = [`${hours}h`];
    if (mins > 0) parts.push(`${mins}m`);
    return cap(parts);
  }

  if (mins > 0) {
    const parts = [`${mins}m`];
    if (secs > 0) parts.push(`${secs}s`);
    return cap(parts);
  }

  return `${Math.max(secs, 1)}s`;
}

export function formatTimeRemaining(endIso: string, maxParts = 3): string {
  const ms = new Date(endIso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Ended";
  return formatCountdownMs(ms, maxParts);
}

export function formatDurationUntil(startIso: string, maxParts = 3): string {
  const ms = new Date(startIso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Started";
  return formatCountdownMs(ms, maxParts);
}

export function qualifyWindowProgress(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.min(100, ((now - start) / (end - start)) * 100);
}

const DEFAULT_CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Elapsed % through the claim window (starts when qualify ends). */
export function claimWindowProgress(
  qualifyEndIso: string,
  claimEndIso: string | null | undefined
): number {
  const start = new Date(qualifyEndIso).getTime();
  const end = claimEndIso
    ? new Date(claimEndIso).getTime()
    : start + DEFAULT_CLAIM_WINDOW_MS;
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.min(100, ((now - start) / (end - start)) * 100);
}

/** Progress bar fill for the active campaign phase (qualify vs claim). */
export function airdropTimelineProgress(
  displayStatus: AirdropDisplayStatus,
  qualifyStart: string,
  qualifyEnd: string,
  claimEnd?: string | null
): number | undefined {
  if (displayStatus === "UPCOMING" || displayStatus === "QUALIFYING") {
    return qualifyWindowProgress(qualifyStart, qualifyEnd);
  }
  if (displayStatus === "CLAIMABLE") {
    return claimWindowProgress(qualifyEnd, claimEnd);
  }
  return undefined;
}

export function showAirdropProgressBar(displayStatus: AirdropDisplayStatus): boolean {
  return (
    displayStatus === "UPCOMING" ||
    displayStatus === "QUALIFYING" ||
    displayStatus === "CLAIMABLE"
  );
}

export function formatQualifyDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatQualifyDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isEndingSoon(endIso: string, withinHours = 48): boolean {
  const ms = new Date(endIso).getTime() - Date.now();
  return Number.isFinite(ms) && ms > 0 && ms <= withinHours * 60 * 60 * 1000;
}

export function projectedRankRewardAmount(totalFunded: string, rank: number): number {
  if (rank < 1 || rank > 100) return 0;
  const totalWei = parseEther(totalFunded || "0");
  const rewardWei = rewardAmountForRank(totalWei, rank);
  return Number(formatEther(rewardWei));
}

export function projectedRankRewardUsd(
  totalFunded: string,
  rank: number,
  item: AirdropRewardMeta,
  bnbUsd: number | null | undefined
): number | null {
  const amount = projectedRankRewardAmount(totalFunded, rank);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!item.rewardToken) return bnbToUsd(amount, bnbUsd);
  const priceBnb = Number(item.rewardPriceBnb);
  if (!Number.isFinite(priceBnb) || priceBnb <= 0 || bnbUsd == null) return null;
  return amount * priceBnb * bnbUsd;
}

export function formatProjectedRankReward(
  totalFunded: string,
  rank: number,
  opts: { isBnb: boolean; symbol?: string | null }
): string {
  const amount = projectedRankRewardAmount(totalFunded, rank);
  if (amount <= 0) return "—";
  return formatAirdropReward(String(amount), opts);
}

export function airdropRewardAmountUsd(
  amount: string | number,
  item: AirdropRewardMeta,
  bnbUsd: number | null | undefined
): number | null {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (!item.rewardToken) return bnbToUsd(value, bnbUsd);
  const priceBnb = Number(item.rewardPriceBnb);
  if (!Number.isFinite(priceBnb) || priceBnb <= 0 || bnbUsd == null) return null;
  return value * priceBnb * bnbUsd;
}

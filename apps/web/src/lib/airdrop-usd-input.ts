import { formatEther, parseEther } from "viem";
import { DEFAULT_TOKEN_TOTAL_SUPPLY } from "@/lib/format-usd";

/** Spot BNB-per-token from bonding-curve market cap (1B supply). */
export function tokenPriceBnbFromMcap(marketCapBnb: string | null | undefined): number | null {
  const mcap = Number(marketCapBnb);
  if (!Number.isFinite(mcap) || mcap <= 0) return null;
  const price = mcap / DEFAULT_TOKEN_TOTAL_SUPPLY;
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Compact editable USD string (no $ prefix). */
export function formatUsdInputValue(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "";
  const fixed = usd >= 1 ? usd.toFixed(2) : usd >= 0.01 ? usd.toFixed(4) : usd.toFixed(6);
  return fixed.replace(/\.?0+$/, "");
}

export function parseUsdInput(usdStr: string): number | null {
  const trimmed = usdStr.trim();
  if (!trimmed) return null;
  const usd = Number(trimmed);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return usd;
}

export type RewardUsdConvertOpts = {
  isBnbReward: boolean;
  bnbUsd: number;
  /** BNB per token; ignored for native rewards. */
  priceBnb: number | null;
};

export function usdToRewardWei(usdStr: string, opts: RewardUsdConvertOpts): bigint | null {
  const usd = parseUsdInput(usdStr);
  if (usd == null || opts.bnbUsd <= 0) return null;
  try {
    if (opts.isBnbReward) {
      return parseEther((usd / opts.bnbUsd).toFixed(12));
    }
    if (opts.priceBnb == null || opts.priceBnb <= 0) return null;
    const tokenUsd = opts.priceBnb * opts.bnbUsd;
    if (!(tokenUsd > 0)) return null;
    return parseEther((usd / tokenUsd).toFixed(12));
  } catch {
    return null;
  }
}

export function rewardWeiToUsd(wei: bigint, opts: RewardUsdConvertOpts): number | null {
  if (wei <= 0n || opts.bnbUsd <= 0) return null;
  const amount = Number(formatEther(wei));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (opts.isBnbReward) {
    const usd = amount * opts.bnbUsd;
    return Number.isFinite(usd) ? usd : null;
  }
  if (opts.priceBnb == null || opts.priceBnb <= 0) return null;
  const usd = amount * opts.priceBnb * opts.bnbUsd;
  return Number.isFinite(usd) ? usd : null;
}

export function usdInputFromRewardWei(wei: bigint, opts: RewardUsdConvertOpts): string {
  const usd = rewardWeiToUsd(wei, opts);
  return usd != null ? formatUsdInputValue(usd) : "";
}

export function usdToBnbAmountString(usdStr: string, bnbUsd: number): string {
  const usd = parseUsdInput(usdStr);
  if (usd == null || bnbUsd <= 0) return "";
  try {
    const wei = parseEther((usd / bnbUsd).toFixed(12));
    if (wei <= 0n) return "";
    const raw = formatEther(wei);
    return raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
  } catch {
    return "";
  }
}

export function bnbAmountToUsdInput(bnbStr: string, bnbUsd: number): string {
  const bnb = Number(bnbStr.trim());
  if (!Number.isFinite(bnb) || bnb <= 0 || bnbUsd <= 0) return "";
  return formatUsdInputValue(bnb * bnbUsd);
}

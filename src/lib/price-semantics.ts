/**
 * Spot / Quote / Fill price semantics — see `.cursor/docs/price-accuracy-contract.md`.
 */

import { SLIPPAGE_BPS } from "@/lib/bonding-curve";

export type PriceSurface = "spot" | "quote" | "fill";

/** UI prefix for estimated (pre-execution) prices. */
export const QUOTE_PRICE_PREFIX = "Est.";

/** Extra tolerance beyond user slippage setting (bps). */
export const PRICE_ACCURACY_EXTRA_BPS = 50;

/** Average execution price from a curve quote (BNB per token, human units). */
export function quoteFillPriceBnb(
  spendBnb: number,
  receiveTokens: number
): number | null {
  if (
    !Number.isFinite(spendBnb) ||
    !Number.isFinite(receiveTokens) ||
    spendBnb <= 0 ||
    receiveTokens <= 0
  ) {
    return null;
  }
  return spendBnb / receiveTokens;
}

export function formatEstimatedPriceUsd(
  priceUsd: number | null | undefined,
  formatUsd: (value: number) => string | null
): string | null {
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  const formatted = formatUsd(priceUsd);
  if (!formatted) return null;
  return `${QUOTE_PRICE_PREFIX} ~${formatted}`;
}

export function quoteFillDeviationBps(
  quoteUsd: number,
  fillUsd: number
): number | null {
  if (
    !Number.isFinite(quoteUsd) ||
    !Number.isFinite(fillUsd) ||
    quoteUsd <= 0 ||
    fillUsd <= 0
  ) {
    return null;
  }
  return (Math.abs(fillUsd - quoteUsd) / quoteUsd) * 10_000;
}

export function isPriceAccuracyViolation(deviationBps: number): boolean {
  const toleranceBps = Number(SLIPPAGE_BPS) + PRICE_ACCURACY_EXTRA_BPS;
  return deviationBps > toleranceBps;
}

export function logPriceAccuracyViolation(details: {
  tokenAddress: string;
  side: "buy" | "sell";
  quoteUsd: number;
  fillUsd: number;
  deviationBps: number;
  txHash: string;
}): void {
  console.warn(
    JSON.stringify({
      event: "price_accuracy_violation",
      ...details,
      toleranceBps: Number(SLIPPAGE_BPS) + PRICE_ACCURACY_EXTRA_BPS,
      at: new Date().toISOString(),
    })
  );
}

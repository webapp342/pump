import { formatPumpSubscriptPrice } from "@/lib/candles";
import { NATIVE_SYMBOL } from "@/config/chain";

/** Default meme total supply on bonding curves. */
export const DEFAULT_TOKEN_TOTAL_SUPPLY = 1_000_000_000;

/** Use one decimal ($1234.5) below this; compact K/M above. */
export const USD_COMPACT_K_THRESHOLD = 10_000;

/** Portfolio holdings: show $X.XX between $1 and this cap (avoids $4.99 → $5.0). */
export const USD_HOLDINGS_VALUE_TWO_DECIMAL_MAX = 20;

export type FormatUsdReadableOptions = {
  compact?: boolean;
  signed?: boolean;
  fallback?: string;
  /** With compact: 2 decimals for $1 … max (portfolio row value). */
  twoDecimalsUnder?: number;
};

export const PORTFOLIO_HOLDING_VALUE_USD_OPTS: FormatUsdReadableOptions = {
  compact: true,
  twoDecimalsUnder: USD_HOLDINGS_VALUE_TWO_DECIMAL_MAX,
};

export function formatPortfolioHoldingValueUsd(
  value: number | null | undefined
): string {
  return formatUsdReadable(value, PORTFOLIO_HOLDING_VALUE_USD_OPTS);
}

/** Portfolio fees cards — readable USD, no chart subscript sizing. */
export function formatPortfolioFeesUsd(
  bnbAmount: number,
  bnbUsd: number | null | undefined
): string {
  if (!Number.isFinite(bnbAmount) || bnbAmount <= 0) {
    return "$0";
  }
  const usd = bnbToUsd(bnbAmount, bnbUsd);
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 10_000) return `$${(usd / 1_000).toFixed(1)}K`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  if (usd > 0) return `$${usd.toFixed(4)}`;
  return "$0";
}

/** Signed USD for portfolio PNL stats — always two decimals, no compact/subscript. */
export function formatUsdSignedTwoDecimals(
  value: number | null | undefined,
  fallback = "$0.00"
): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatUsd(
  value: number | null | undefined,
  opts?: { compact?: boolean }
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (opts?.compact && value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (opts?.compact && value >= USD_COMPACT_K_THRESHOLD) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  if (opts?.compact && value >= 1) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toExponential(2)}`;
}

export function formatUsdReadable(
  value: number | null | undefined,
  opts?: FormatUsdReadableOptions
): string {
  if (value == null || !Number.isFinite(value)) return opts?.fallback ?? "—";

  const abs = Math.abs(value);
  const sign = opts?.signed ? (value > 0 ? "+" : value < 0 ? "-" : "") : value < 0 ? "-" : "";

  if (opts?.compact && abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (opts?.compact && abs >= USD_COMPACT_K_THRESHOLD) {
    return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  }
  if (
    opts?.compact &&
    opts.twoDecimalsUnder != null &&
    abs >= 1 &&
    abs < opts.twoDecimalsUnder
  ) {
    return `${sign}$${abs.toFixed(2)}`;
  }
  if (opts?.compact && abs >= 1) return `${sign}$${abs.toFixed(1)}`;
  if (opts?.compact && abs > 0) return `${sign}${formatPumpSubscriptPrice(abs, "$")}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(4)}`;
  if (abs > 0) {
    const decimals =
      abs >= 0.001 ? 6 :
      abs >= 0.0001 ? 7 :
      abs >= 0.00001 ? 8 :
      abs >= 0.000001 ? 9 : 10;
    return `${sign}$${abs.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")}`;
  }

  return "$0";
}

export function bnbToUsd(bnbAmount: number, bnbUsd: number | null | undefined): number | null {
  if (bnbUsd == null || !Number.isFinite(bnbAmount) || bnbAmount <= 0) return null;
  const usd = bnbAmount * bnbUsd;
  return Number.isFinite(usd) ? usd : null;
}

/** Scale frozen USD cost basis when on-chain balance < indexed balance. */
export function scaleCostBasisUsdForBalance(
  costBasisUsd: number,
  indexedBalance: number,
  displayBalance: number
): number {
  if (!Number.isFinite(costBasisUsd) || costBasisUsd <= 0) return 0;
  if (!Number.isFinite(indexedBalance) || indexedBalance <= 0) return 0;
  if (!Number.isFinite(displayBalance) || displayBalance <= 0) return 0;
  if (displayBalance >= indexedBalance) return costBasisUsd;
  return costBasisUsd * (displayBalance / indexedBalance);
}

/**
 * Open-lot cost in USD for entry / unrealized P/L.
 *
 * Prefer trade-time frozen USD when it is complete. If some buys were indexed
 * with a missing nativeUsdRate, USD stays partial while native cost is full —
 * that would mark almost the entire position value as "profit". Fall back to
 * native×live FX when frozen USD is far below the live-native cost.
 */
export function resolveOpenLotCostUsd(
  remainingCostBasisUsd: number,
  remainingCostBasisBnb: number,
  liveBnbUsd: number | null | undefined
): number | null {
  const frozenUsd =
    Number.isFinite(remainingCostBasisUsd) && remainingCostBasisUsd > 0
      ? remainingCostBasisUsd
      : 0;
  const liveNativeUsd =
    liveBnbUsd != null &&
    Number.isFinite(liveBnbUsd) &&
    liveBnbUsd > 0 &&
    Number.isFinite(remainingCostBasisBnb) &&
    remainingCostBasisBnb > 0
      ? remainingCostBasisBnb * liveBnbUsd
      : 0;

  if (frozenUsd > 0 && liveNativeUsd > 0) {
    // Incomplete USD lot (missing oracle on some buys) — trust native cost.
    if (frozenUsd < liveNativeUsd * 0.5) return liveNativeUsd;
    return frozenUsd;
  }
  if (frozenUsd > 0) return frozenUsd;
  if (liveNativeUsd > 0) return liveNativeUsd;
  return null;
}

/** Avg entry USD/token — frozen cost basis first, native×live rate fallback. */
export function positionAvgEntryUsd(
  balance: number,
  remainingCostBasisUsd: number,
  remainingCostBasisBnb: number,
  liveBnbUsd: number | null | undefined
): number | null {
  if (!(balance > 0)) return null;
  const costUsd = resolveOpenLotCostUsd(
    remainingCostBasisUsd,
    remainingCostBasisBnb,
    liveBnbUsd
  );
  if (costUsd == null || costUsd <= 0) return null;
  return costUsd / balance;
}

/**
 * Mark-to-market unrealized P/L in USD.
 * Cost frozen at trade-time USD; mark = balance × spot_native × live FX.
 */
export function positionUnrealizedUsd(
  balance: number,
  markPriceBnb: number,
  remainingCostBasisUsd: number,
  remainingCostBasisBnb: number,
  liveBnbUsd: number | null | undefined
): number | null {
  const markUsd = bnbToUsd(balance * markPriceBnb, liveBnbUsd);
  if (markUsd == null) return null;
  const costUsd = resolveOpenLotCostUsd(
    remainingCostBasisUsd,
    remainingCostBasisBnb,
    liveBnbUsd
  );
  if (costUsd == null) return null;
  return markUsd - costUsd;
}

export function positionUnrealizedPct(
  unrealizedUsd: number | null,
  remainingCostBasisUsd: number,
  remainingCostBasisBnb: number,
  liveBnbUsd: number | null | undefined
): number | null {
  const costUsd = resolveOpenLotCostUsd(
    remainingCostBasisUsd,
    remainingCostBasisBnb,
    liveBnbUsd
  );
  if (unrealizedUsd == null || costUsd == null || costUsd <= 0) return null;
  return (unrealizedUsd / costUsd) * 100;
}

/** Net BNB moved on the curve for a trade row (after protocol fee). */
export function tradeNetBnbFromParts(
  nativeAmount: string,
  feeBnb?: string | null,
  netBnb?: string | null
): number {
  if (netBnb != null) {
    const net = Number(netBnb);
    if (Number.isFinite(net)) return Math.max(0, net);
  }
  const fee = Number(feeBnb ?? 0);
  const gross = Number(nativeAmount);
  return Math.max(0, gross - fee);
}

/** Effective fill price (BNB per token) — net notional ÷ tokens; matches Amount column. */
export function tradeFillPriceBnb(
  nativeAmount: string,
  tokenAmount: string,
  feeBnb?: string | null,
  netBnb?: string | null,
  storedPriceBnb?: string | null
): number | null {
  const tokens = Number(tokenAmount);
  if (!Number.isFinite(tokens) || tokens <= 0) return null;

  const net = tradeNetBnbFromParts(nativeAmount, feeBnb, netBnb);
  if (net > 0) return net / tokens;

  const stored = Number(storedPriceBnb ?? 0);
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

export function resolveTradeNativeUsdRate(
  snapshotRate: string | number | null | undefined,
  liveRate: number | null | undefined
): number | null {
  const snap =
    snapshotRate != null && snapshotRate !== "" ? Number(snapshotRate) : Number.NaN;
  if (Number.isFinite(snap) && snap > 0) return snap;
  if (liveRate != null && Number.isFinite(liveRate) && liveRate > 0) return liveRate;
  return null;
}

export function tradeNetUsdForDisplay(
  trade: {
    nativeAmount: string;
    feeBnb?: string | null;
    netBnb?: string | null;
    nativeUsdRate?: string | null;
  },
  liveBnbUsd?: number | null
): number | null {
  const rate = resolveTradeNativeUsdRate(trade.nativeUsdRate, liveBnbUsd);
  if (rate == null) return null;
  return bnbToUsd(tradeNetBnbFromParts(trade.nativeAmount, trade.feeBnb, trade.netBnb), rate);
}

export function formatTradeFillPriceUsd(
  nativeAmount: string,
  tokenAmount: string,
  bnbUsd: number | null | undefined,
  feeBnb?: string | null,
  netBnb?: string | null,
  storedPriceBnb?: string | null,
  nativeUsdRate?: string | null
): string {
  const priceBnb = tradeFillPriceBnb(
    nativeAmount,
    tokenAmount,
    feeBnb,
    netBnb,
    storedPriceBnb
  );
  const rate = resolveTradeNativeUsdRate(nativeUsdRate, bnbUsd);
  if (priceBnb == null || rate == null) return "—";
  return formatUsdReadable(priceBnb * rate, { compact: true });
}

/** Mobile tape — fixed 2-decimal USD trade size. */
export function formatTradeAmountUsdFixed2(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  return `$${Math.abs(usd).toFixed(2)}`;
}

export function tradeFillPriceUsd(
  nativeAmount: string,
  tokenAmount: string,
  bnbUsd: number | null | undefined,
  feeBnb?: string | null,
  netBnb?: string | null,
  storedPriceBnb?: string | null,
  nativeUsdRate?: string | null
): number | null {
  const priceBnb = tradeFillPriceBnb(
    nativeAmount,
    tokenAmount,
    feeBnb,
    netBnb,
    storedPriceBnb
  );
  const rate = resolveTradeNativeUsdRate(nativeUsdRate, bnbUsd);
  if (priceBnb == null || rate == null) return null;
  const usd = priceBnb * rate;
  return Number.isFinite(usd) ? usd : null;
}

/** Mobile tape — pump subscript price ($0.0₅7983) at all scales. */
export function formatTradeFillPriceSubscript(
  nativeAmount: string,
  tokenAmount: string,
  bnbUsd: number | null | undefined,
  feeBnb?: string | null,
  netBnb?: string | null,
  storedPriceBnb?: string | null,
  nativeUsdRate?: string | null
): string {
  const usd = tradeFillPriceUsd(
    nativeAmount,
    tokenAmount,
    bnbUsd,
    feeBnb,
    netBnb,
    storedPriceBnb,
    nativeUsdRate
  );
  if (usd == null) return "—";
  return formatPumpSubscriptPrice(usd, "$");
}

export function formatBnbWithUsd(
  bnbAmount: number,
  bnbUsd: number | null | undefined,
  opts?: { compact?: boolean }
): { bnb: string; usd: string | null } {
  const bnb =
    bnbAmount >= 1_000
      ? `${bnbAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${NATIVE_SYMBOL}`
      : `${bnbAmount.toFixed(bnbAmount >= 1 ? 4 : 6)} ${NATIVE_SYMBOL}`;

  const usdValue = bnbToUsd(bnbAmount, bnbUsd);
  return { bnb, usd: usdValue != null ? formatUsd(usdValue, opts) : null };
}

export function tokenAmountUsd(
  tokenAmount: number,
  priceBnb: number,
  bnbUsd: number | null | undefined
): number | null {
  if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return null;
  if (!Number.isFinite(priceBnb) || priceBnb <= 0 || bnbUsd == null) return null;
  const usd = tokenAmount * priceBnb * bnbUsd;
  return Number.isFinite(usd) ? usd : null;
}

export function tokenPriceUsd(priceBnb: number, bnbUsd: number | null | undefined): number | null {
  if (bnbUsd == null || !Number.isFinite(priceBnb) || priceBnb <= 0) return null;
  const usd = priceBnb * bnbUsd;
  return Number.isFinite(usd) ? usd : null;
}

export function estimateFdvUsd(
  priceBnb: number,
  bnbUsd: number | null | undefined,
  totalSupply = DEFAULT_TOKEN_TOTAL_SUPPLY
): number | null {
  return tokenPriceUsd(priceBnb * totalSupply, bnbUsd);
}

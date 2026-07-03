import { safeReturnPath } from "@/lib/safe-return-path";

export type TradePrefillConfig = {
  side: "buy" | "sell";
  buyMode?: "bnb" | "token" | "usd";
  amount?: string;
  /** Prefill sell with full on-chain token balance. */
  sellMax?: boolean;
  /** Prefill sell with a percentage of on-chain token balance (1–100). */
  sellPercent?: number;
  /** Prefill buy with max spend (BNB balance minus gas). */
  buyMax?: boolean;
  /** After prefill (and sellMax/buyMax), submit the trade once quotes are ready. */
  autoSubmit?: boolean;
};

function trimTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "").replace(/\.$/, "");
}

export function remainingRuleAmount(current: string, target: string): string | undefined {
  const currentN = Number(current);
  const targetN = Number(target);
  if (!Number.isFinite(targetN) || targetN <= 0) return undefined;

  const rem = Number.isFinite(currentN) ? Math.max(0, targetN - currentN) : targetN;
  if (!Number.isFinite(rem) || rem <= 0) return undefined;

  if (rem >= 1) return trimTrailingZeros(rem.toFixed(6));
  return trimTrailingZeros(rem.toFixed(8));
}

export function buildTokenTradeUrl(
  tokenAddress: string,
  opts?: {
    side?: "buy" | "sell";
    buyMode?: "bnb" | "token";
    amount?: string;
    met?: boolean;
    returnTo?: string;
  }
): string {
  const base = `/token/${tokenAddress.toLowerCase()}`;
  const params = new URLSearchParams({ trade: opts?.side ?? "buy" });

  if (!opts?.met && opts?.buyMode) {
    params.set("mode", opts.buyMode);
    if (opts.amount) params.set("amount", opts.amount);
  }

  const returnTo = safeReturnPath(opts?.returnTo);
  if (returnTo) params.set("returnTo", returnTo);

  return `${base}?${params.toString()}`;
}

export function parseTradePrefillFromSearchParams(
  params: Pick<URLSearchParams, "get">
): TradePrefillConfig | null {
  const trade = params.get("trade");
  if (trade !== "buy" && trade !== "sell") return null;

  const mode = params.get("mode");
  const amount = params.get("amount")?.trim();
  const sellPctRaw = params.get("sellPct");
  const sellPct = sellPctRaw != null ? Number(sellPctRaw) : NaN;

  return {
    side: trade,
    buyMode:
      mode === "bnb" || mode === "token" || mode === "usd" ? mode : undefined,
    amount: amount && amount.length > 0 ? amount : undefined,
    sellPercent: Number.isFinite(sellPct) ? Math.max(1, Math.min(100, Math.round(sellPct))) : undefined,
    autoSubmit: params.get("auto") === "1",
  };
}

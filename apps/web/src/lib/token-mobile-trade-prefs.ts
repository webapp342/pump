import type { TradePrefillConfig } from "@/lib/token-trade-prefill";

export type TokenMobileTradePrefs = {
  orderValueUsd: string;
};

type LegacyTokenMobileTradePrefs = Partial<
  TokenMobileTradePrefs & { buyAmountUsd?: string; sellPercent?: number }
>;

export const TOKEN_MOBILE_TRADE_PREFS_KEY = "pump-token-mobile-trade-prefs";
export const TOKEN_MOBILE_TRADE_SIDE_KEY = "pump-token-mobile-trade-side";
export const TOKEN_MOBILE_TRADE_CHANGE_EVENT = "pump:token-mobile-trade";

export const DEFAULT_TOKEN_MOBILE_TRADE: TokenMobileTradePrefs = {
  orderValueUsd: "12",
};

function normalizeOrderValueUsd(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_TOKEN_MOBILE_TRADE.orderValueUsd;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TOKEN_MOBILE_TRADE.orderValueUsd;
  if (n >= 10) return String(Math.round(n * 100) / 100);
  const formatted = n
    .toFixed(2)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
  return formatted;
}

export function formatTokenMobileOrderValueUsd(amount: string): string {
  const n = Number(normalizeOrderValueUsd(amount));
  if (!Number.isFinite(n) || n <= 0) return "$—";

  if (n >= 10) {
    return `$${Math.round(n)}`;
  }

  const formatted = n
    .toFixed(2)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
  return `$${formatted}`;
}

function resolveStoredOrderValueUsd(parsed: LegacyTokenMobileTradePrefs): string {
  if (parsed.orderValueUsd) return normalizeOrderValueUsd(parsed.orderValueUsd);
  if (parsed.buyAmountUsd) return normalizeOrderValueUsd(parsed.buyAmountUsd);
  return DEFAULT_TOKEN_MOBILE_TRADE.orderValueUsd;
}

export function readTokenMobileTradePrefs(): TokenMobileTradePrefs {
  if (typeof window === "undefined") return DEFAULT_TOKEN_MOBILE_TRADE;
  try {
    const raw = localStorage.getItem(TOKEN_MOBILE_TRADE_PREFS_KEY);
    if (!raw) return DEFAULT_TOKEN_MOBILE_TRADE;
    const parsed = JSON.parse(raw) as LegacyTokenMobileTradePrefs;
    return {
      orderValueUsd: resolveStoredOrderValueUsd(parsed),
    };
  } catch {
    return DEFAULT_TOKEN_MOBILE_TRADE;
  }
}

export function writeTokenMobileTradePrefs(prefs: Partial<TokenMobileTradePrefs>): void {
  const current = readTokenMobileTradePrefs();
  const normalized: TokenMobileTradePrefs = {
    orderValueUsd: normalizeOrderValueUsd(prefs.orderValueUsd ?? current.orderValueUsd),
  };
  try {
    localStorage.setItem(TOKEN_MOBILE_TRADE_PREFS_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(TOKEN_MOBILE_TRADE_CHANGE_EVENT));
  } catch {
    // Ignore storage errors.
  }
}

export function readTokenMobileTradeSide(): "buy" | "sell" {
  if (typeof window === "undefined") return "buy";
  try {
    const raw = localStorage.getItem(TOKEN_MOBILE_TRADE_SIDE_KEY);
    return raw === "sell" ? "sell" : "buy";
  } catch {
    return "buy";
  }
}

export function writeTokenMobileTradeSide(side: "buy" | "sell"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOKEN_MOBILE_TRADE_SIDE_KEY, side);
  } catch {
    // Ignore storage errors.
  }
}

export function buildTokenMobileQuickTradePrefill(
  side: "buy" | "sell",
  prefs: TokenMobileTradePrefs = readTokenMobileTradePrefs()
): TradePrefillConfig {
  return {
    side,
    buyMode: "usd",
    amount: prefs.orderValueUsd,
    autoSubmit: true,
  };
}

export function buildTokenMobileTradeEditPrefill(
  side: "buy" | "sell" = readTokenMobileTradeSide(),
  prefs: TokenMobileTradePrefs = readTokenMobileTradePrefs()
): TradePrefillConfig {
  return {
    side,
    buyMode: "usd",
    amount: prefs.orderValueUsd,
  };
}

export function persistTokenMobileTradeFromPanel(state: {
  hasTradeAmount: boolean;
  orderValueUsd: number | null;
}): void {
  if (
    !state.hasTradeAmount ||
    state.orderValueUsd == null ||
    !Number.isFinite(state.orderValueUsd) ||
    state.orderValueUsd <= 0
  ) {
    return;
  }

  writeTokenMobileTradePrefs({
    orderValueUsd: normalizeOrderValueUsd(String(state.orderValueUsd)),
  });
}

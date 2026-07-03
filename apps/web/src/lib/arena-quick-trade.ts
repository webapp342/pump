import type { TradePrefillConfig } from "@/lib/token-trade-prefill";

export type ArenaQuickTradePrefs = {
  buyAmountBnb: string;
  sellPercent: number;
};

export const ARENA_QUICK_TRADE_STORAGE_KEY = "pump-arena-quick-trade";
export const ARENA_QUICK_TRADE_CHANGE_EVENT = "pump:arena-quick-trade";

export const DEFAULT_ARENA_QUICK_TRADE: ArenaQuickTradePrefs = {
  buyAmountBnb: "0.01",
  sellPercent: 50,
};

function normalizeBuyAmount(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_ARENA_QUICK_TRADE.buyAmountBnb;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ARENA_QUICK_TRADE.buyAmountBnb;
  return trimmed;
}

function normalizeSellPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ARENA_QUICK_TRADE.sellPercent;
  return Math.max(1, Math.min(100, Math.round(value)));
}

export function readArenaQuickTradePrefs(): ArenaQuickTradePrefs {
  if (typeof window === "undefined") return DEFAULT_ARENA_QUICK_TRADE;
  try {
    const raw = localStorage.getItem(ARENA_QUICK_TRADE_STORAGE_KEY);
    if (!raw) return DEFAULT_ARENA_QUICK_TRADE;
    const parsed = JSON.parse(raw) as Partial<ArenaQuickTradePrefs>;
    return {
      buyAmountBnb: normalizeBuyAmount(parsed.buyAmountBnb ?? DEFAULT_ARENA_QUICK_TRADE.buyAmountBnb),
      sellPercent: normalizeSellPercent(parsed.sellPercent ?? DEFAULT_ARENA_QUICK_TRADE.sellPercent),
    };
  } catch {
    return DEFAULT_ARENA_QUICK_TRADE;
  }
}

export function writeArenaQuickTradePrefs(prefs: ArenaQuickTradePrefs): void {
  const normalized: ArenaQuickTradePrefs = {
    buyAmountBnb: normalizeBuyAmount(prefs.buyAmountBnb),
    sellPercent: normalizeSellPercent(prefs.sellPercent),
  };
  try {
    localStorage.setItem(ARENA_QUICK_TRADE_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(ARENA_QUICK_TRADE_CHANGE_EVENT));
  } catch {
    // Ignore storage errors.
  }
}

export function buildArenaQuickTradePrefill(
  side: "buy" | "sell",
  prefs: ArenaQuickTradePrefs = readArenaQuickTradePrefs()
): TradePrefillConfig {
  if (side === "buy") {
    return {
      side: "buy",
      buyMode: "bnb",
      amount: prefs.buyAmountBnb,
      autoSubmit: true,
    };
  }
  return {
    side: "sell",
    sellPercent: prefs.sellPercent,
    autoSubmit: true,
  };
}

export function buildArenaQuickTradeHref(
  tokenAddress: string,
  side: "buy" | "sell",
  prefs: ArenaQuickTradePrefs = readArenaQuickTradePrefs()
): string {
  const addr = tokenAddress.toLowerCase();
  const params = new URLSearchParams({ trade: side, auto: "1" });

  if (side === "buy") {
    params.set("mode", "bnb");
    params.set("amount", prefs.buyAmountBnb);
  } else {
    params.set("sellPct", String(prefs.sellPercent));
  }

  return `/token/${addr}?${params.toString()}`;
}

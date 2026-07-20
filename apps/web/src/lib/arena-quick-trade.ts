import type { TradePrefillConfig } from "@/lib/token-trade-prefill";
import { tokenDetailPath } from "@/lib/token-routes";

export type ArenaQuickTradePrefs = {
  buyAmountUsd: string;
  sellPercent: number;
};

/** @deprecated Legacy localStorage field — migrated on read. */
type LegacyArenaQuickTradePrefs = Partial<ArenaQuickTradePrefs & { buyAmountBnb?: string }>;

export const ARENA_QUICK_TRADE_STORAGE_KEY = "pump-arena-quick-trade";
export const ARENA_QUICK_TRADE_CHANGE_EVENT = "pump:arena-quick-trade";

/** Rough BNB→USD rate for migrating legacy quick-trade prefs. */
const LEGACY_BNB_USD_MIGRATION_RATE = 600;

export const DEFAULT_ARENA_QUICK_TRADE: ArenaQuickTradePrefs = {
  buyAmountUsd: "3",
  sellPercent: 50,
};

function normalizeBuyAmount(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_ARENA_QUICK_TRADE.buyAmountUsd;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ARENA_QUICK_TRADE.buyAmountUsd;
  return trimmed;
}

function normalizeSellPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ARENA_QUICK_TRADE.sellPercent;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function resolveBuyAmountUsd(parsed: LegacyArenaQuickTradePrefs): string {
  if (parsed.buyAmountUsd) return normalizeBuyAmount(parsed.buyAmountUsd);

  const legacyBnb = parsed.buyAmountBnb?.trim();
  if (legacyBnb) {
    const bnb = Number(legacyBnb);
    if (Number.isFinite(bnb) && bnb > 0) {
      const usd = bnb * LEGACY_BNB_USD_MIGRATION_RATE;
      return normalizeBuyAmount(String(Math.max(1, Math.round(usd * 100) / 100)));
    }
  }

  return DEFAULT_ARENA_QUICK_TRADE.buyAmountUsd;
}

export function quickTradeSwipeLabels(
  prefs: ArenaQuickTradePrefs = readArenaQuickTradePrefs()
): { buyLabel: string; sellLabel: string } {
  return {
    buyLabel: `Buy ${formatQuickTradeBuyUsd(prefs.buyAmountUsd)}`,
    sellLabel: `Sell ${prefs.sellPercent}%`,
  };
}

export function formatQuickTradeBuyUsd(amount: string): string {
  const n = Number(normalizeBuyAmount(amount));
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

export function readArenaQuickTradePrefs(): ArenaQuickTradePrefs {
  if (typeof window === "undefined") return DEFAULT_ARENA_QUICK_TRADE;
  try {
    const raw = localStorage.getItem(ARENA_QUICK_TRADE_STORAGE_KEY);
    if (!raw) return DEFAULT_ARENA_QUICK_TRADE;
    const parsed = JSON.parse(raw) as LegacyArenaQuickTradePrefs;
    return {
      buyAmountUsd: resolveBuyAmountUsd(parsed),
      sellPercent: normalizeSellPercent(parsed.sellPercent ?? DEFAULT_ARENA_QUICK_TRADE.sellPercent),
    };
  } catch {
    return DEFAULT_ARENA_QUICK_TRADE;
  }
}

export function writeArenaQuickTradePrefs(prefs: ArenaQuickTradePrefs): void {
  const normalized: ArenaQuickTradePrefs = {
    buyAmountUsd: normalizeBuyAmount(prefs.buyAmountUsd),
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
      buyMode: "usd",
      amount: prefs.buyAmountUsd,
    };
  }
  return {
    side: "sell",
    sellPercent: prefs.sellPercent,
  };
}

export function buildArenaQuickTradeHref(
  tokenAddress: string,
  side: "buy" | "sell",
  prefs: ArenaQuickTradePrefs = readArenaQuickTradePrefs()
): string {
  const params = new URLSearchParams({ trade: side, auto: "1" });

  if (side === "buy") {
    params.set("mode", "usd");
    params.set("amount", prefs.buyAmountUsd);
  } else {
    params.set("sellPct", String(prefs.sellPercent));
  }

  return `${tokenDetailPath(tokenAddress)}?${params.toString()}`;
}

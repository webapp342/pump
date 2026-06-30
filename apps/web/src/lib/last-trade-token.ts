import { normalizeAddressParam } from "@/lib/address";

export const LAST_TRADE_TOKEN_STORAGE_KEY = "pump-last-trade-token";

export function readLastTradeTokenAddress(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LAST_TRADE_TOKEN_STORAGE_KEY);
    if (!stored?.trim()) return null;
    return normalizeAddressParam(stored);
  } catch {
    return null;
  }
}

export function writeLastTradeTokenAddress(address: string): void {
  const normalized = normalizeAddressParam(address);
  if (!normalized) return;
  try {
    localStorage.setItem(LAST_TRADE_TOKEN_STORAGE_KEY, normalized);
  } catch {
    /* quota / private mode */
  }
}

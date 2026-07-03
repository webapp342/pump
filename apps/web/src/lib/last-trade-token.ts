import { normalizeAddressParam } from "@/lib/address";
import { LAST_TRADE_TOKEN_COOKIE_NAME } from "@/lib/last-trade-token-cookie";

export const LAST_TRADE_TOKEN_STORAGE_KEY = "pump-last-trade-token";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90;

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

export function writeLastTradeTokenCookie(address: string): void {
  if (typeof document === "undefined") return;
  const normalized = normalizeAddressParam(address);
  if (!normalized) return;
  document.cookie = `${LAST_TRADE_TOKEN_COOKIE_NAME}=${encodeURIComponent(normalized)};path=/;max-age=${COOKIE_MAX_AGE_SEC};samesite=lax`;
}

export function writeLastTradeTokenAddress(address: string): void {
  const normalized = normalizeAddressParam(address);
  if (!normalized) return;
  try {
    localStorage.setItem(LAST_TRADE_TOKEN_STORAGE_KEY, normalized);
  } catch {
    /* quota / private mode */
  }
  writeLastTradeTokenCookie(normalized);
}

/** One-time migration for sessions that have localStorage but no cookie yet. */
export function syncLastTradeTokenCookieFromStorage(): void {
  const last = readLastTradeTokenAddress();
  if (last) writeLastTradeTokenCookie(last);
}

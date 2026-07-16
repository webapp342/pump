import { normalizeAddressParam } from "@/lib/address";
import {
  LAST_TRADE_TOKEN_COOKIE_NAME,
  parseLastTradeTokenCookie,
} from "@/lib/last-trade-token-cookie";

export const LAST_TRADE_TOKEN_STORAGE_KEY = "pump-last-trade-token";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90;

function readLastTradeTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LAST_TRADE_TOKEN_STORAGE_KEY);
    if (!stored?.trim()) return null;
    return normalizeAddressParam(stored);
  } catch {
    return null;
  }
}

/** Client-only — localStorage wins over cookie when both exist. */
export function readLastTradeTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LAST_TRADE_TOKEN_COOKIE_NAME}=([^;]*)`)
  );
  return parseLastTradeTokenCookie(match?.[1]);
}

export function readLastTradeTokenAddress(): string | null {
  return readLastTradeTokenFromStorage() ?? readLastTradeTokenFromCookie();
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

/** Keep localStorage + cookie aligned — localStorage is source of truth when both exist. */
export function syncLastTradeTokenPersistence(): void {
  const fromStorage = readLastTradeTokenFromStorage();
  if (fromStorage) {
    writeLastTradeTokenCookie(fromStorage);
    return;
  }
  const fromCookie = readLastTradeTokenFromCookie();
  if (!fromCookie) return;
  try {
    localStorage.setItem(LAST_TRADE_TOKEN_STORAGE_KEY, fromCookie);
  } catch {
    /* quota / private mode */
  }
}

/** @deprecated Use syncLastTradeTokenPersistence */
export function syncLastTradeTokenCookieFromStorage(): void {
  syncLastTradeTokenPersistence();
}

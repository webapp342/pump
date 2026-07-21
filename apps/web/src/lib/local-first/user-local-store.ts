/**
 * Zero-inspired local-first reads — favorites + portfolio snapshot in localStorage.
 * Full Rocicorp Zero sync is Tier 4+ future; this gives 0ms hydration today.
 */

import { addressCacheKey } from "@/lib/address";

const FAVORITES_PREFIX = "pump:lf:favorites:";
const FAVORITE_TOKENS_PREFIX = "pump:lf:favorite-tokens:";
const PORTFOLIO_PREFIX = "pump:lf:portfolio:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedPortfolioPayload = Record<string, unknown>;

type StoredPayload<T> = {
  at: number;
  data: T;
};

function storageKey(prefix: string, address: string): string {
  // Never lowercase Solana base58 — case is part of the address.
  const key = addressCacheKey(address) ?? address.trim();
  return `${prefix}${key}`;
}

function canonicalizeAddressList(addresses: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of addresses) {
    const key = addressCacheKey(item) ?? item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPayload<T>;
    if (!parsed?.at || !parsed.data) return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPayload<T> = { at: Date.now(), data };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function getLocalFavorites(address: string): string[] | null {
  const raw = readJson<string[]>(storageKey(FAVORITES_PREFIX, address));
  if (!raw) return null;
  return canonicalizeAddressList(raw);
}

export function setLocalFavorites(address: string, favorites: string[]): void {
  writeJson(storageKey(FAVORITES_PREFIX, address), canonicalizeAddressList(favorites));
}

export function getLocalFavoriteTokens(address: string): Record<string, unknown>[] | null {
  return readJson<Record<string, unknown>[]>(storageKey(FAVORITE_TOKENS_PREFIX, address));
}

export function setLocalFavoriteTokens(address: string, tokens: Record<string, unknown>[]): void {
  writeJson(storageKey(FAVORITE_TOKENS_PREFIX, address), tokens);
}

export function getLocalPortfolioSnapshot(address: string): CachedPortfolioPayload | null {
  return readJson<CachedPortfolioPayload>(storageKey(PORTFOLIO_PREFIX, address));
}

export function setLocalPortfolioSnapshot(
  address: string,
  snapshot: CachedPortfolioPayload
): void {
  writeJson(storageKey(PORTFOLIO_PREFIX, address), snapshot);
}

export function clearLocalUserData(address: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(FAVORITES_PREFIX, address));
  window.localStorage.removeItem(storageKey(FAVORITE_TOKENS_PREFIX, address));
  window.localStorage.removeItem(storageKey(PORTFOLIO_PREFIX, address));
}

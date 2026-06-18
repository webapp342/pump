/**
 * Zero-inspired local-first reads — favorites + portfolio snapshot in localStorage.
 * Full Rocicorp Zero sync is Tier 4+ future; this gives 0ms hydration today.
 */

const FAVORITES_PREFIX = "pump:lf:favorites:";
const PORTFOLIO_PREFIX = "pump:lf:portfolio:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedPortfolioPayload = Record<string, unknown>;

type StoredPayload<T> = {
  at: number;
  data: T;
};

function storageKey(prefix: string, address: string): string {
  return `${prefix}${address.toLowerCase()}`;
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
  return readJson<string[]>(storageKey(FAVORITES_PREFIX, address));
}

export function setLocalFavorites(address: string, favorites: string[]): void {
  writeJson(
    storageKey(FAVORITES_PREFIX, address),
    favorites.map((item) => item.toLowerCase())
  );
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
  window.localStorage.removeItem(storageKey(PORTFOLIO_PREFIX, address));
}

const TTL_MS = 5_000;

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

function normalizeTokenKey(tokenAddress: string): string {
  // Preserve Solana base58 case; only lowercase EVM 0x addresses.
  return tokenAddress.startsWith("0x") || tokenAddress.startsWith("0X")
    ? tokenAddress.toLowerCase()
    : tokenAddress;
}

export function getHoldersCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setHoldersCache<T>(key: string, data: T): void {
  store.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

export function holdersCacheKey(tokenAddress: string, limit: number, offset: number): string {
  return `holders:${normalizeTokenKey(tokenAddress)}:${limit}:${offset}`;
}

/** Drop all cached holder pages for a token (call after trades / explicit refresh). */
export function invalidateHoldersCache(tokenAddress: string): void {
  const prefix = `holders:${normalizeTokenKey(tokenAddress)}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

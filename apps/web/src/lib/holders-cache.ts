const TTL_MS = 45_000;

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

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
  // Preserve Solana base58 case; only lowercase EVM 0x addresses.
  const key =
    tokenAddress.startsWith("0x") || tokenAddress.startsWith("0X")
      ? tokenAddress.toLowerCase()
      : tokenAddress;
  return `holders:${key}:${limit}:${offset}`;
}

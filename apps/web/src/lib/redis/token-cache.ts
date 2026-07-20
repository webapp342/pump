import type { TokenDetailBundle } from "@/lib/token-server";
import { normalizeRouteAddressKey } from "@/lib/address";
import { readCacheJson, writeCacheJson } from "@/lib/redis/client";

const TOKEN_SNAPSHOT_TTL_SEC = 5;

export function buildTokenSnapshotCacheKey(tokenAddress: string): string {
  return `pump:cache:token:${normalizeRouteAddressKey(tokenAddress)}`;
}

export async function readTokenSnapshotCache(
  tokenAddress: string
): Promise<TokenDetailBundle | null> {
  return readCacheJson<TokenDetailBundle>(buildTokenSnapshotCacheKey(tokenAddress));
}

export async function writeTokenSnapshotCache(
  tokenAddress: string,
  payload: TokenDetailBundle
): Promise<void> {
  await writeCacheJson(
    buildTokenSnapshotCacheKey(tokenAddress),
    payload,
    TOKEN_SNAPSHOT_TTL_SEC
  );
}

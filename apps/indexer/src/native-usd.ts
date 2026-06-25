/**
 * Cached native/USD for indexer candle USD snapshots (BNBUSDT / ETHUSDT).
 */

const CACHE_MS = 30_000;
let cache: { rate: number; fetchedAt: number; pair: string } | null = null;

function nativeUsdPair(): string {
  const chainId = Number(process.env.ZUGCHAIN_CHAIN_ID ?? process.env.CHAIN_ID ?? 97);
  if (chainId === 8453 || chainId === 84532) return "ETHUSDT";
  return "BNBUSDT";
}

export async function fetchIndexerNativeUsdRate(): Promise<number | null> {
  const pair = nativeUsdPair();
  if (cache && cache.pair === pair && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.rate;
  }

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return cache?.rate ?? null;
    const body = (await res.json()) as { price?: string };
    const rate = Number(body.price);
    if (!Number.isFinite(rate) || rate <= 0) return cache?.rate ?? null;
    cache = { rate, fetchedAt: Date.now(), pair };
    return rate;
  } catch {
    return cache?.rate ?? null;
  }
}

/**
 * Cached SOL/USD for indexer candle + position USD snapshots (free public APIs).
 */

const CACHE_MS = 30_000;
let cache: { rate: number; fetchedAt: number } | null = null;

export async function fetchIndexerNativeUsdRate(): Promise<number | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.rate;
  }

  const tryBinance = async (): Promise<number | null> => {
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { price?: string };
    const rate = Number(body.price);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return rate;
  };

  const tryCoingecko = async (): Promise<number | null> => {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { solana?: { usd?: number } };
    const rate = body.solana?.usd;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
    return rate;
  };

  try {
    const rate = (await tryBinance()) ?? (await tryCoingecko());
    if (rate != null) {
      cache = { rate, fetchedAt: Date.now() };
      return rate;
    }
  } catch {
    // fall through
  }
  return cache?.rate ?? null;
}

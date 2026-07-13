/**
 * Cached native/USD for indexer candle USD snapshots (BNBUSDT / ETHUSDT).
 */

const CACHE_MS = 30_000;
let cache: { rate: number; fetchedAt: number; pair: string } | null = null;

function nativeUsdPair(): string {
  const chainId = Number(process.env.CHAIN_ID ?? 84532);
  if (chainId === 8453 || chainId === 84532) return "ETHUSDT";
  return "BNBUSDT";
}

export async function fetchIndexerNativeUsdRate(): Promise<number | null> {
  const pair = nativeUsdPair();
  const symbol = pair === "ETHUSDT" ? "ETH" : "BNB";
  if (cache && cache.pair === pair && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.rate;
  }

  const tryBinance = async (): Promise<number | null> => {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { price?: string };
    const rate = Number(body.price);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return rate;
  };

  const tryCoingecko = async (): Promise<number | null> => {
    const id = symbol === "ETH" ? "ethereum" : "binancecoin";
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, { usd?: number }>;
    const rate = body[id]?.usd;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
    return rate;
  };

  try {
    const rate = (await tryBinance()) ?? (await tryCoingecko());
    if (rate != null) {
      cache = { rate, fetchedAt: Date.now(), pair };
      return rate;
    }
  } catch {
    // fall through
  }
  return cache?.pair === pair ? cache.rate : null;
}

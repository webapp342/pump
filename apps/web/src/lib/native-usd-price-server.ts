import "server-only";

import { CHAIN_ID } from "@/config/chain";
import { isSolanaChainFamily } from "@/config/chain-family";
import { readRedisNativePrice } from "@/lib/redis/price-cache";
import {
  nativeUsdPairForChain,
  type NativeUsdQuote,
} from "@/lib/native-usd-price";

const CACHE_MS = 2_000;
const STALE_CACHE_MS = 60 * 60 * 1_000;

type CachedNativeUsd = {
  pair: string;
  symbol: string;
  nativeUsd: number;
  fetchedAt: number;
};

let cache: CachedNativeUsd | null = null;

const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
};

async function fetchFromBinance(pair: string): Promise<number | null> {
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { price?: string };
  const nativeUsd = Number(body.price);
  if (!Number.isFinite(nativeUsd) || nativeUsd <= 0) return null;
  return nativeUsd;
}

async function fetchFromCoinGecko(symbol: string): Promise<number | null> {
  const id = COINGECKO_IDS[symbol];
  if (!id) return null;
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { cache: "no-store", signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, { usd?: number }>;
  const nativeUsd = body[id]?.usd;
  if (typeof nativeUsd !== "number" || !Number.isFinite(nativeUsd) || nativeUsd <= 0) {
    return null;
  }
  return nativeUsd;
}

function staleCachedQuote(pair: string, symbol: string): NativeUsdQuote | null {
  if (!cache || cache.pair !== pair || Date.now() - cache.fetchedAt > STALE_CACHE_MS) {
    return null;
  }
  return {
    nativeUsd: cache.nativeUsd,
    quote: "USDT",
    source: "cache",
    pair,
    symbol,
  };
}

/** Server-only: live native/USD (Redis price worker → Binance → CoinGecko). */
export async function fetchNativeUsdPrice(
  chainId = CHAIN_ID
): Promise<NativeUsdQuote> {
  const { pair, symbol } = nativeUsdPairForChain(chainId);

  if (isSolanaChainFamily) {
    const cached = await readRedisNativePrice();
    if (cached) {
      return {
        nativeUsd: cached.nativeUsd,
        quote: "USDT",
        source: "cache",
        pair,
        symbol,
      };
    }
  }

  if (cache && cache.pair === pair && Date.now() - cache.fetchedAt < CACHE_MS) {
    return {
      nativeUsd: cache.nativeUsd,
      quote: "USDT",
      source: "cache",
      pair,
      symbol,
    };
  }

  try {
    const fromBinance = await fetchFromBinance(pair);
    if (fromBinance != null) {
      cache = { pair, symbol, nativeUsd: fromBinance, fetchedAt: Date.now() };
      return { nativeUsd: fromBinance, quote: "USDT", source: "binance", pair, symbol };
    }
  } catch {
    // fall through to CoinGecko
  }

  try {
    const fromCoingecko = await fetchFromCoinGecko(symbol);
    if (fromCoingecko != null) {
      cache = { pair, symbol, nativeUsd: fromCoingecko, fetchedAt: Date.now() };
      return { nativeUsd: fromCoingecko, quote: "USDT", source: "coingecko", pair, symbol };
    }
  } catch {
    // fall through
  }

  const stale = staleCachedQuote(pair, symbol);
  if (stale) return stale;

  return { nativeUsd: null, quote: "USDT", source: "unavailable", pair, symbol };
}

export type { NativeUsdQuote };

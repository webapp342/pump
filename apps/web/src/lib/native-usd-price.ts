import { CHAIN_ID } from "@/config/chain";
import { isSolanaChainFamily } from "@/config/chain-family";

const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

export type NativeUsdQuote = {
  /** USD price of the chain native token (BNB or ETH). */
  nativeUsd: number | null;
  quote: "USDT";
  source: "cache" | "binance" | "coingecko" | "unavailable";
  /** Primary ticker, e.g. BNBUSDT or ETHUSDT (Binance) */
  pair: string;
  /** Human symbol for UI: BNB | ETH */
  symbol: string;
};

type CachedNativeUsd = {
  pair: string;
  symbol: string;
  nativeUsd: number;
  fetchedAt: number;
};

const CACHE_MS = 2_000;
/** Serve last good rate when all upstream oracles fail (e.g. Binance geo-block on VM). */
const STALE_CACHE_MS = 60 * 60 * 1_000;
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

/** Resolve Binance spot pair for the active chain family's native currency. */
export function nativeUsdPairForChain(chainId = CHAIN_ID): {
  pair: string;
  symbol: string;
} {
  if (isSolanaChainFamily) {
    return { pair: "SOLUSDT", symbol: "SOL" };
  }
  if (chainId === BASE_MAINNET_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID) {
    return { pair: "ETHUSDT", symbol: "ETH" };
  }
  return { pair: "BNBUSDT", symbol: "BNB" };
}

/** Live native/USD (SOLUSDT on Solana, ETHUSDT on Base, BNBUSDT on BSC). */
export async function fetchNativeUsdPrice(
  chainId = CHAIN_ID
): Promise<NativeUsdQuote> {
  const { pair, symbol } = nativeUsdPairForChain(chainId);

  if (isSolanaChainFamily) {
    const cached = await import("@/lib/redis/price-cache").then((m) =>
      m.readRedisNativePrice()
    );
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

/** Reject stale SSR/cache rates from the wrong Binance pair (BNB on Base, etc.). */
export function isPlausibleNativeUsdForChain(
  nativeUsd: number,
  chainId = CHAIN_ID
): boolean {
  if (!Number.isFinite(nativeUsd) || nativeUsd <= 0) return false;
  const { symbol } = nativeUsdPairForChain(chainId);
  if (symbol === "SOL") return nativeUsd >= 5 && nativeUsd <= 2_000;
  if (symbol === "ETH") return nativeUsd >= 900;
  return nativeUsd <= 1_200;
}

/** Last trade-time native/USD snapshot — stabilizes USD columns when live oracle blips. */
export function latestNativeUsdFromTrades(
  trades: ReadonlyArray<{ nativeUsdRate?: string | null }>
): number | null {
  for (const trade of trades) {
    const rate = Number(trade.nativeUsdRate);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }
  return null;
}

/** Client display: prefer live hook oracle; fall back to SSR/API seed only when live is unavailable. */
export function resolveDisplayNativeUsd(
  liveNativeUsd: number | null | undefined,
  seededNativeUsd: number | null | undefined,
  chainId = CHAIN_ID
): number | null {
  if (typeof liveNativeUsd === "number" && Number.isFinite(liveNativeUsd) && liveNativeUsd > 0) {
    return liveNativeUsd;
  }
  if (
    typeof seededNativeUsd === "number" &&
    Number.isFinite(seededNativeUsd) &&
    seededNativeUsd > 0 &&
    isPlausibleNativeUsdForChain(seededNativeUsd, chainId)
  ) {
    return seededNativeUsd;
  }
  return null;
}

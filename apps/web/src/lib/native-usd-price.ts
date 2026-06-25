import { CHAIN_ID } from "@/config/chain";

const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

export type NativeUsdQuote = {
  /** USD price of the chain native token (BNB or ETH). */
  nativeUsd: number | null;
  quote: "USDT";
  source: "cache" | "binance" | "unavailable";
  /** Binance ticker used, e.g. BNBUSDT or ETHUSDT */
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
let cache: CachedNativeUsd | null = null;

/** Resolve Binance spot pair for the configured chain's native currency. */
export function nativeUsdPairForChain(chainId = CHAIN_ID): {
  pair: string;
  symbol: string;
} {
  if (chainId === BASE_MAINNET_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID) {
    return { pair: "ETHUSDT", symbol: "ETH" };
  }
  return { pair: "BNBUSDT", symbol: "BNB" };
}

/** Live native/USD from Binance (BNBUSDT on BSC, ETHUSDT on Base). */
export async function fetchNativeUsdPrice(
  chainId = CHAIN_ID
): Promise<NativeUsdQuote> {
  const { pair, symbol } = nativeUsdPairForChain(chainId);

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
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) {
      return { nativeUsd: null, quote: "USDT", source: "unavailable", pair, symbol };
    }

    const body = (await res.json()) as { price?: string };
    const nativeUsd = Number(body.price);
    if (!Number.isFinite(nativeUsd) || nativeUsd <= 0) {
      return { nativeUsd: null, quote: "USDT", source: "unavailable", pair, symbol };
    }

    cache = { pair, symbol, nativeUsd, fetchedAt: Date.now() };
    return { nativeUsd, quote: "USDT", source: "binance", pair, symbol };
  } catch {
    return { nativeUsd: null, quote: "USDT", source: "unavailable", pair, symbol };
  }
}

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

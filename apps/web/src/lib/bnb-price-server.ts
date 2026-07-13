import { fetchNativeUsdPrice } from "@/lib/native-usd-price";

/** @deprecated Use fetchNativeUsdPrice — kept for legacy imports. Returns chain-native/USD (ETH on Base). */
export async function fetchBnbUsdPrice(): Promise<{
  bnbUsd: number | null;
  quote: "USDT";
  source: "cache" | "binance" | "coingecko" | "unavailable";
}> {
  const { nativeUsd, source } = await fetchNativeUsdPrice();
  return {
    bnbUsd: nativeUsd,
    quote: "USDT",
    source,
  };
}

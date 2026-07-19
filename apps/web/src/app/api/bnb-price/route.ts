import { NextResponse } from "next/server";
import { fetchNativeUsdPrice } from "@/lib/native-usd-price";

export async function GET() {
  const { nativeUsd, quote, source, pair, symbol } = await fetchNativeUsdPrice();

  return NextResponse.json(
    {
      /** @deprecated legacy name — same as nativeUsd (SOL on Solana, ETH on Base, BNB on BSC). */
      bnbUsd: nativeUsd,
      nativeUsd,
      quote,
      source,
      pair,
      symbol,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}

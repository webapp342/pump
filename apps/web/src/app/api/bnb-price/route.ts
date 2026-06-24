import { NextResponse } from "next/server";
import { fetchNativeUsdPrice } from "@/lib/native-usd-price";

export async function GET() {
  const { nativeUsd, quote, source, pair, symbol } = await fetchNativeUsdPrice();

  return NextResponse.json(
    {
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

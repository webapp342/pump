import { NextResponse } from "next/server";
import { fetchBnbUsdPrice } from "@/lib/bnb-price-server";

export async function GET() {
  const { bnbUsd, quote, source } = await fetchBnbUsdPrice();

  return NextResponse.json(
    {
      bnbUsd,
      quote,
      source,
      pair: "BNB/USDT",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}

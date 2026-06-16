import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { fetchWalletLaunchpadHoldings } from "@/lib/portfolio-onchain";

/** GET /api/portfolio/wallet-holdings — on-chain launchpad token balances not in indexer positions. */
export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  const excludeParam = request.nextUrl.searchParams.get("exclude");
  const exclude = excludeParam
    ? excludeParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const scope = request.nextUrl.searchParams.get("scope");
  const creatorAddress = scope === "creator" ? address : undefined;
  const scanLimitParam = request.nextUrl.searchParams.get("scanLimit");
  const parsedScanLimit = scanLimitParam ? Number.parseInt(scanLimitParam, 10) : undefined;
  const scanLimit =
    parsedScanLimit != null && Number.isFinite(parsedScanLimit) && parsedScanLimit > 0
      ? parsedScanLimit
      : undefined;

  try {
    const data = await fetchWalletLaunchpadHoldings(address, exclude, {
      creatorAddress,
      scanLimit,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[portfolio/wallet-holdings]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

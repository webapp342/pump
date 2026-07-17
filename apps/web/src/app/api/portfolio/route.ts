import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { hasActiveMarketItem } from "@/lib/db/incentive";
import { getPortfolioForAddress } from "@/lib/db/launchpad";
import {
  PORTFOLIO_LAUNCHED_INITIAL,
  PORTFOLIO_LAUNCHED_MAX,
} from "@/lib/portfolio-limits";

const STATUS_BADGE_ITEM_ID = "status_badge";

function parseCreatedLimit(value: string | null): number | undefined {
  if (value === "all") return undefined;
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return PORTFOLIO_LAUNCHED_INITIAL;
  }
  return Math.min(parsed, PORTFOLIO_LAUNCHED_MAX);
}

export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  const createdLimit = parseCreatedLimit(request.nextUrl.searchParams.get("createdLimit"));

  try {
    const [data, hasStatusBadge] = await Promise.all([
      getPortfolioForAddress(address, { createdLimit }),
      hasActiveMarketItem(address, STATUS_BADGE_ITEM_ID),
    ]);
    return NextResponse.json({ data: { ...data, hasStatusBadge } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

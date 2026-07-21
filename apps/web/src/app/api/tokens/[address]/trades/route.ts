import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ACTIVITY_PAGE_SIZE } from "@/lib/activity-page-size";
import { normalizeAddressParam } from "@/lib/address";
import {
  countTradesForToken,
  getTokenByAddress,
} from "@/lib/db/launchpad";
import { listTapeTradesForToken } from "@/lib/tape-trades";

type RouteContext = { params: Promise<{ address: string }> };

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return ACTIVITY_PAGE_SIZE;
  return Math.min(parsed, 50);
}

function parseOffset(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { address: addressParam } = await context.params;
  const tokenAddress = normalizeAddressParam(addressParam);
  if (!tokenAddress) {
    return NextResponse.json({ error: "Valid token address is required" }, { status: 400 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const offset = parseOffset(request.nextUrl.searchParams.get("offset"));

  try {
    const token = await getTokenByAddress(tokenAddress);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const [{ trades, source }, total] = await Promise.all([
      listTapeTradesForToken(tokenAddress, limit, offset),
      countTradesForToken(tokenAddress),
    ]);

    return NextResponse.json(
      {
        data: trades,
        meta: {
          limit,
          offset,
          total,
          hasMore: offset + trades.length < total,
          tapeSource: source,
        },
      },
      { headers: { "Cache-Control": "private, max-age=5" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

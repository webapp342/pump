import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { countTokensByCreator, listTokensByCreator } from "@/lib/db/launchpad";
import {
  PORTFOLIO_LAUNCHED_INITIAL,
  PORTFOLIO_LAUNCHED_MAX,
} from "@/lib/portfolio-limits";

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return PORTFOLIO_LAUNCHED_INITIAL;
  }
  return Math.min(parsed, PORTFOLIO_LAUNCHED_MAX);
}

function parseOffset(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const offset = parseOffset(request.nextUrl.searchParams.get("offset"));

  try {
    const [tokens, total] = await Promise.all([
      listTokensByCreator(address, limit, offset),
      countTokensByCreator(address),
    ]);

    return NextResponse.json({
      data: {
        tokens,
        total,
        limit,
        offset,
        hasMore: offset + tokens.length < total,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

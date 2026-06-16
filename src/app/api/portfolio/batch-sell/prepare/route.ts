import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import {
  prepareBatchSellTargets,
  type BatchSellHoldingInput,
} from "@/lib/batch-sell-prepare";

/** POST /api/portfolio/batch-sell/prepare — quote on-chain sells for portfolio batch exit. */
export async function POST(request: NextRequest) {
  let body: { address?: string; holdings?: BatchSellHoldingInput[] };
  try {
    body = (await request.json()) as { address?: string; holdings?: BatchSellHoldingInput[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = normalizeAddressParam(body.address ?? null);
  if (!address) {
    return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
  }

  const holdings = Array.isArray(body.holdings) ? body.holdings : [];
  if (holdings.length === 0) {
    return NextResponse.json({ data: { targets: [], skipped: 0 } });
  }

  try {
    const data = await prepareBatchSellTargets(address, holdings);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[portfolio/batch-sell/prepare]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

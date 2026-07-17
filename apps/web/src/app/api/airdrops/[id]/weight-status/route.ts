import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { hasAirdropWeightBoost } from "@/lib/db/incentive";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const airdropId = id?.trim();
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!airdropId) {
    return NextResponse.json({ error: "Airdrop id required" }, { status: 400 });
  }
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  try {
    const applied = await hasAirdropWeightBoost(address, airdropId);
    return NextResponse.json({ data: { applied } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import {
  listFavoriteTokenAddresses,
  listTokenListItemsByAddresses,
} from "@/lib/db/launchpad";

export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  const includeTokens = request.nextUrl.searchParams.get("include") === "tokens";

  try {
    const addresses = await listFavoriteTokenAddresses(address);
    if (!includeTokens) {
      return NextResponse.json({ data: addresses });
    }

    const tokens = await listTokenListItemsByAddresses(addresses);
    return NextResponse.json({ data: addresses, tokens });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

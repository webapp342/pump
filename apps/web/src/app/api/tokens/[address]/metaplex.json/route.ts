import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getTokenByAddress } from "@/lib/db/launchpad";
import { normalizeAddressParam } from "@/lib/address";
import { resolveLaunchpadLogoUri } from "@/lib/assets";

type RouteContext = { params: Promise<{ address: string }> };

/** Standard Metaplex off-chain JSON — explorers and aggregators fetch this from the token metadata URI. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { address } = await context.params;
  const tokenAddress = normalizeAddressParam(address);
  if (!tokenAddress) {
    return NextResponse.json({ error: "Valid token address required" }, { status: 400 });
  }

  const token = await getTokenByAddress(tokenAddress);
  if (!token) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const image = resolveLaunchpadLogoUri(token.logoUrl, token.address);
  const payload: Record<string, unknown> = {
    name: token.name,
    symbol: token.symbol,
    description: token.description?.trim() || undefined,
    image,
    showName: true,
    createdOn: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://pump.zugchain.org",
  };

  const social = token.socialLinks ?? {};
  if (social.twitter) payload.twitter = social.twitter;
  if (social.telegram) payload.telegram = social.telegram;
  if (social.website) payload.website = social.website;
  if (social.discord) payload.discord = social.discord;

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

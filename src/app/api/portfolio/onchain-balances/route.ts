import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { fetchOnChainTokenBalancesForWallet } from "@/lib/portfolio-onchain";

async function resolveOnChainBalances(
  address: string,
  tokenAddresses: string[]
): Promise<Record<string, string>> {
  if (tokenAddresses.length === 0) return {};

  const balances = await fetchOnChainTokenBalancesForWallet(address, tokenAddresses);
  const data: Record<string, string> = {};
  for (const tokenAddress of tokenAddresses) {
    data[tokenAddress.toLowerCase()] = balances.get(tokenAddress.toLowerCase()) ?? "0";
  }
  return data;
}

/** GET /api/portfolio/onchain-balances — verify indexer positions via ERC20 balanceOf. */
export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  const tokensParam = request.nextUrl.searchParams.get("tokens");
  const tokenAddresses = tokensParam
    ? tokensParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  if (tokenAddresses.length === 0) {
    return NextResponse.json({ data: {} });
  }

  try {
    const data = await resolveOnChainBalances(address, tokenAddresses);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[portfolio/onchain-balances]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/portfolio/onchain-balances — batched body for large position lists. */
export async function POST(request: NextRequest) {
  let body: { address?: string; tokens?: string[] };
  try {
    body = (await request.json()) as { address?: string; tokens?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = normalizeAddressParam(body.address ?? null);
  if (!address) {
    return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
  }

  const tokenAddresses = Array.isArray(body.tokens)
    ? body.tokens.map((value) => value.trim()).filter(Boolean)
    : [];

  if (tokenAddresses.length === 0) {
    return NextResponse.json({ data: {} });
  }

  try {
    const data = await resolveOnChainBalances(address, tokenAddresses);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[portfolio/onchain-balances]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ACTIVITY_PAGE_SIZE } from "@/lib/activity-page-size";
import { normalizeAddressParam } from "@/lib/address";
import {
  countTokenHolders,
  getTokenByAddress,
  listTokenHolders,
} from "@/lib/db/launchpad";
import { fetchOnChainTokenBalancesForHolders } from "@/lib/portfolio-onchain";
import { getHoldersCache, holdersCacheKey, setHoldersCache } from "@/lib/holders-cache";

type RouteContext = { params: Promise<{ address: string }> };

type HolderResponse = Array<{
  address: string;
  tokenBalance: string;
  totalBoughtBnb: string;
  totalSoldBnb: string;
  realizedPnlBnb: string;
  remainingCostBasisBnb: string;
  remainingCostBasisUsd?: string;
  onChainBalance?: string;
}>;

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
    const cacheKey = holdersCacheKey(tokenAddress, limit, offset);
    const cached = getHoldersCache<HolderResponse>(cacheKey);
    if (cached) {
      const total = await countTokenHolders(tokenAddress);
      return NextResponse.json(
        {
          data: cached,
          meta: {
            limit,
            offset,
            total,
            hasMore: offset + cached.length < total,
          },
        },
        { headers: { "Cache-Control": "private, max-age=15" } }
      );
    }

    const token = await getTokenByAddress(tokenAddress);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const [holders, total] = await Promise.all([
      listTokenHolders(tokenAddress, limit, offset),
      countTokenHolders(tokenAddress),
    ]);

    const onChain = await fetchOnChainTokenBalancesForHolders(
      tokenAddress,
      holders.map((holder) => holder.address)
    );

    const data: HolderResponse = holders.map((holder) => ({
      address: holder.address,
      tokenBalance: holder.tokenBalance,
      totalBoughtBnb: holder.totalBoughtBnb,
      totalSoldBnb: holder.totalSoldBnb,
      realizedPnlBnb: holder.realizedPnlBnb,
      remainingCostBasisBnb: holder.remainingCostBasisBnb,
      remainingCostBasisUsd: holder.remainingCostBasisUsd,
      onChainBalance: onChain.get(holder.address.toLowerCase()),
    }));

    setHoldersCache(cacheKey, data);

    return NextResponse.json(
      {
        data,
        meta: {
          limit,
          offset,
          total,
          hasMore: offset + data.length < total,
        },
      },
      { headers: { "Cache-Control": "private, max-age=15" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

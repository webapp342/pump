import { NextResponse } from "next/server";
import { getSeasonStatus } from "@/lib/redis/season-status";
import { fetchPendingSeasonRewardsLamports } from "@/lib/solana/silent-claim-season";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  try {
    const status = await getSeasonStatus();
    const seasonId = status.settledSeasonId;
    const pendingLamports =
      seasonId != null && status.claimsOpen
        ? await fetchPendingSeasonRewardsLamports(address, seasonId)
        : 0n;

    return NextResponse.json({
      data: {
        seasonId,
        claimsOpen: status.claimsOpen,
        pendingLamports: pendingLamports.toString(),
        canClaim: status.claimsOpen && pendingLamports > 0n,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Season rewards unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

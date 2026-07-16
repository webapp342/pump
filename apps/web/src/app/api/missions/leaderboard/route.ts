import { NextResponse } from "next/server";
import { getAdminProtocolSnapshot } from "@/lib/admin-onchain";
import { getXpLeaderboard } from "@/lib/db/incentive";

const LEADERBOARD_SIZE = 100;
/** Reward pool = this fraction of on-chain LaunchpadTreasury native balance (same source as admin). */
const TREASURY_POOL_SHARE = 0.25;

export async function GET() {
  try {
    const [protocol, entries] = await Promise.all([
      getAdminProtocolSnapshot(),
      getXpLeaderboard(LEADERBOARD_SIZE),
    ]);

    const treasuryBalanceNative = Number(protocol.treasury.balanceBnb);
    const rewardPoolNative = treasuryBalanceNative * TREASURY_POOL_SHARE;
    const totalXp = entries.reduce((sum, row) => sum + row.lifetimePoints, 0);
    const filledSeats = Math.min(LEADERBOARD_SIZE, entries.length);

    const ranked = entries.map((row) => {
      const shareWeight = totalXp > 0 ? row.lifetimePoints / totalXp : 0;
      return {
        ...row,
        shareWeight,
        shareNative: rewardPoolNative * shareWeight,
      };
    });

    return NextResponse.json({
      data: {
        treasuryAddress: protocol.treasury.address,
        treasuryBalanceNative,
        rewardPoolNative,
        poolSharePercent: TREASURY_POOL_SHARE * 100,
        leaderboardSize: LEADERBOARD_SIZE,
        seatCount: filledSeats,
        totalXp,
        topShareNative: ranked[0]?.shareNative ?? 0,
        entries: ranked,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

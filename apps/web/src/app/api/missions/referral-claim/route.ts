import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import {
  claimReferralInviteXp,
  getMissionsForAddress,
  getReferralInviteXpStatus,
  REFERRAL_INVITE_XP_KEY,
} from "@/lib/db/incentive";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { address?: string };
    const address = normalizeAddressParam(body.address);

    if (!address) {
      return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
    }

    const before = await getReferralInviteXpStatus(address);
    if (before.claimableCount === 0) {
      return NextResponse.json({ error: "Nothing to claim yet" }, { status: 400 });
    }

    const result = await claimReferralInviteXp(address);
    if (result.claimedInvites === 0 || result.pointsAwarded === 0) {
      // Status said claimable but write awarded 0 — usually stale UI or address CHECK / case mismatch.
      if (before.claimableCount > 0) {
        return NextResponse.json(
          {
            error:
              "Claim failed while invites were pending. Refresh Rewards, then retry. If it persists, migration 051 may be missing on the database.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Nothing to claim yet" }, { status: 400 });
    }

    const [snapshot, referralStatus] = await Promise.all([
      getMissionsForAddress(address),
      getReferralInviteXpStatus(address),
    ]);

    const missions = snapshot.missions.map((mission) => {
      if (mission.taskKey !== REFERRAL_INVITE_XP_KEY) return mission;
      return {
        ...mission,
        completed: false,
        referralClaim: referralStatus,
      };
    });

    return NextResponse.json({
      data: {
        claimedInvites: result.claimedInvites,
        pointsAwarded: result.pointsAwarded,
        totalPoints: snapshot.totalPoints,
        lifetimePoints: snapshot.lifetimePoints,
        missions,
        referralClaim: referralStatus,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { NATIVE_SYMBOL } from "@/config/chain";
import { normalizeAddressParam } from "@/lib/address";
import {
  ensureFirstSmartBuyAward,
  ensureVolumeMonsterAward,
  getMissionsForAddress,
  getReferralInviteXpStatus,
  REFERRAL_INVITE_XP_KEY,
} from "@/lib/db/incentive";
import {
  FIRST_SMART_BUY_MIN_BNB,
  getFirstSmartBuyQualifyingTrade,
  getUserVolumeBnb,
} from "@/lib/db/launchpad";

const VOLUME_MONSTER_KEY = "LAUNCHPAD_VOLUME_MONSTER";
const FIRST_SMART_BUY_KEY = "LAUNCHPAD_FIRST_SMART_BUY";
const VOLUME_MONSTER_TARGET = 1;

function attachReferralClaimMeta<T extends { taskKey: string; completed: boolean }>(
  mission: T,
  referralStatus: Awaited<ReturnType<typeof getReferralInviteXpStatus>>
): T & { completed: boolean; referralClaim?: typeof referralStatus } {
  if (mission.taskKey !== REFERRAL_INVITE_XP_KEY) return mission;
  return {
    ...mission,
    completed: false,
    referralClaim: referralStatus,
  };
}

export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  try {
    let [snapshot, volumeBnb, referralStatus] = await Promise.all([
      getMissionsForAddress(address),
      getUserVolumeBnb(address),
      getReferralInviteXpStatus(address),
    ]);

    let missionsChanged = false;

    const smartBuyAlreadyDone = snapshot.missions.some(
      (mission) => mission.taskKey === FIRST_SMART_BUY_KEY && mission.completed
    );
    const volumeMonsterAlreadyDone = snapshot.missions.some(
      (mission) => mission.taskKey === VOLUME_MONSTER_KEY && mission.completed
    );

    /** Expensive trade scan — skip when the award is already completed. */
    let smartBuyTrade = null as Awaited<ReturnType<typeof getFirstSmartBuyQualifyingTrade>>;
    if (!smartBuyAlreadyDone) {
      smartBuyTrade = await getFirstSmartBuyQualifyingTrade(address);
      if (smartBuyTrade) {
        const changed = await ensureFirstSmartBuyAward(address, {
          eventId: smartBuyTrade.eventId,
          txHash: smartBuyTrade.txHash,
          tokenAddress: smartBuyTrade.tokenAddress,
          zugAmountBnb: smartBuyTrade.zugAmountBnb,
        });
        missionsChanged = missionsChanged || changed;
      }
    }

    if (!volumeMonsterAlreadyDone && volumeBnb >= VOLUME_MONSTER_TARGET) {
      const changed = await ensureVolumeMonsterAward(address);
      missionsChanged = missionsChanged || changed;
    }

    if (missionsChanged) {
      [snapshot, referralStatus] = await Promise.all([
        getMissionsForAddress(address),
        getReferralInviteXpStatus(address),
      ]);
    }

    const missions = snapshot.missions.map((mission) => {
      const withReferral = attachReferralClaimMeta(mission, referralStatus);

      if (withReferral.taskKey === VOLUME_MONSTER_KEY && !withReferral.completed) {
        return {
          ...withReferral,
          progress: {
            current: volumeBnb,
            target: VOLUME_MONSTER_TARGET,
            unit: NATIVE_SYMBOL,
          },
        };
      }

      if (withReferral.taskKey === FIRST_SMART_BUY_KEY && !withReferral.completed && !smartBuyTrade) {
        return {
          ...withReferral,
          progress: {
            current: 0,
            target: FIRST_SMART_BUY_MIN_BNB,
            unit: NATIVE_SYMBOL,
          },
        };
      }

      return withReferral;
    });

    return NextResponse.json({
      data: {
        ...snapshot,
        missions,
        tradingVolumeBnb: volumeBnb,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

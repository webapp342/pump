import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-access";
import { getAdminProtocolSnapshot, readAirdropOnChain } from "@/lib/admin-onchain";
import { listAdminAirdrops } from "@/lib/db/admin";
import { formatEther } from "viem";

export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const [protocol, rows] = await Promise.all([getAdminProtocolSnapshot(), listAdminAirdrops()]);

    const nowSec = Math.floor(Date.now() / 1000);
    const airdrops = await Promise.all(
      rows.map(async (row) => {
        const onChain = await readAirdropOnChain(row.onChainId);
        const claimEndSec = onChain?.claimEnd ?? 0;
        const remainingBnb = onChain ? formatEther(onChain.remainingWei) : "0";
        const canSweep =
          onChain !== null &&
          !onChain.remainderSwept &&
          onChain.remainingWei > 0n &&
          nowSec > claimEndSec;

        const sweepStatus = onChain?.remainderSwept
          ? "swept"
          : nowSec <= claimEndSec
            ? row.merkleRoot
              ? "claim_window_open"
              : "claim_window_open_no_winners"
            : onChain && onChain.remainingWei > 0n
              ? "ready"
              : "nothing_to_sweep";

        return {
          ...row,
          remainingBnb,
          totalClaimedBnb: onChain ? formatEther(onChain.totalClaimedWei) : "0",
          claimEndUnix: claimEndSec,
          canSweep,
          sweepStatus,
          sweepRecipient: protocol.airdropManager?.admin ?? null,
        };
      })
    );

    return NextResponse.json(
      {
        data: {
          protocol,
          airdrops,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

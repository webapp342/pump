import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { getAdminProtocolSnapshot } from "@/lib/admin-onchain";
import { getAdminDbStats } from "@/lib/db/admin-stats";

function sumBnbStrings(...values: string[]): string {
  let total = 0;
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) total += n;
  }
  return String(total);
}

export async function GET(request: NextRequest) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const [db, protocol] = await Promise.all([getAdminDbStats(), getAdminProtocolSnapshot()]);

    const treasuryBalanceBnb = protocol.treasury.balanceBnb;
    const availableTotalBnb = sumBnbStrings(
      treasuryBalanceBnb,
      db.pendingCreatorBnb,
      db.pendingReferrerBnb
    );

    return NextResponse.json(
      {
        data: {
          ...db,
          treasuryBalanceBnb,
          availableTotalBnb,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

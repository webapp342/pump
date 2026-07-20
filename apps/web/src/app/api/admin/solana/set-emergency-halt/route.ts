import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSolanaChainFamily } from "@/config/chain-family";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { adminSetEmergencyHalt } from "@/lib/admin-solana-ops";

/** POST /api/admin/solana/set-emergency-halt — authority clear/set Global.emergency_halt. */
export async function POST(request: NextRequest) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isSolanaChainFamily) {
    return NextResponse.json({ error: "Solana chain family required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { halt?: boolean };
    if (typeof body.halt !== "boolean") {
      return NextResponse.json({ error: "halt boolean required" }, { status: 400 });
    }

    const result = await adminSetEmergencyHalt({ halt: body.halt });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Set emergency halt failed";
    console.error("[admin/solana/set-emergency-halt]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

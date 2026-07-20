import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSolanaChainFamily } from "@/config/chain-family";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { listPendingFeeAccounts } from "@/lib/admin-solana-ops";

/** GET /api/admin/solana/pending-fees — creator/referrer PendingFees PDAs with balance > 0. */
export async function GET(request: NextRequest) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isSolanaChainFamily) {
    return NextResponse.json({ error: "Solana chain family required" }, { status: 400 });
  }

  try {
    const rows = await listPendingFeeAccounts();
    return NextResponse.json({ success: true, data: { rows } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list pending fees";
    console.error("[admin/solana/pending-fees]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

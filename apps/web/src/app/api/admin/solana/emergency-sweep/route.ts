import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSolanaChainFamily } from "@/config/chain-family";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { isValidSolanaAddress } from "@/lib/admin-solana-onchain";
import { adminEmergencySweepLiquidity } from "@/lib/admin-solana-ops";

/** POST /api/admin/solana/emergency-sweep — authority drain of shared liquidity vault. */
export async function POST(request: NextRequest) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isSolanaChainFamily) {
    return NextResponse.json({ error: "Solana chain family required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { to?: string };
    const to = body.to?.trim() ?? "";
    if (!isValidSolanaAddress(to)) {
      return NextResponse.json({ error: "Valid Solana recipient required" }, { status: 400 });
    }

    const result = await adminEmergencySweepLiquidity({ to });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Emergency sweep failed";
    console.error("[admin/solana/emergency-sweep]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

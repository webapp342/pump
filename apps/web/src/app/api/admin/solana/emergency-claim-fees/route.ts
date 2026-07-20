import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSolanaChainFamily } from "@/config/chain-family";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { isValidSolanaAddress } from "@/lib/admin-solana-onchain";
import {
  adminEmergencyClaimAllPendingFees,
  adminEmergencyClaimPendingFees,
} from "@/lib/admin-solana-ops";

/** POST /api/admin/solana/emergency-claim-fees — one PDA or all (`all: true`). */
export async function POST(request: NextRequest) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isSolanaChainFamily) {
    return NextResponse.json({ error: "Solana chain family required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      owner?: string;
      kind?: string;
      to?: string;
      all?: boolean;
    };
    const to = body.to?.trim() ?? "";
    if (!isValidSolanaAddress(to)) {
      return NextResponse.json({ error: "Valid Solana recipient required" }, { status: 400 });
    }

    if (body.all === true) {
      const result = await adminEmergencyClaimAllPendingFees({ to });
      return NextResponse.json({
        success: true,
        data: {
          ...result,
          totalLamports: result.totalLamports.toString(),
          results: result.results.map((r) => ({
            ...r,
            amountLamports: r.amountLamports.toString(),
          })),
        },
      });
    }

    const owner = body.owner?.trim() ?? "";
    const kind = body.kind === "referrer" ? "referrer" : body.kind === "creator" ? "creator" : null;

    if (!kind) {
      return NextResponse.json({ error: "kind must be creator or referrer" }, { status: 400 });
    }
    if (!isValidSolanaAddress(owner)) {
      return NextResponse.json(
        { error: "Valid Solana owner and recipient required" },
        { status: 400 }
      );
    }

    const result = await adminEmergencyClaimPendingFees({ owner, kind, to });
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        amountLamports: result.amountLamports.toString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Emergency claim failed";
    console.error("[admin/solana/emergency-claim-fees]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

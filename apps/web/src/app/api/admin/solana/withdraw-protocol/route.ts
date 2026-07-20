import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { NATIVE_DECIMALS } from "@pump/solana-sdk";
import { isSolanaChainFamily } from "@/config/chain-family";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { isValidSolanaAddress } from "@/lib/admin-solana-onchain";
import { adminWithdrawProtocolFees } from "@/lib/admin-solana-ops";

function parseSolToLamports(raw: string): bigint {
  const t = raw.trim();
  if (!t) return 0n;
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error("Invalid amount");
  const [w, f = ""] = t.split(".");
  const frac = (f + "0".repeat(NATIVE_DECIMALS)).slice(0, NATIVE_DECIMALS);
  return BigInt(w) * 10n ** BigInt(NATIVE_DECIMALS) + BigInt(frac || "0");
}

/** POST /api/admin/solana/withdraw-protocol — authority withdraw from protocol-treasury PDA. */
export async function POST(request: NextRequest) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isSolanaChainFamily) {
    return NextResponse.json({ error: "Solana chain family required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { to?: string; amountSol?: string };
    const to = body.to?.trim() ?? "";
    if (!isValidSolanaAddress(to)) {
      return NextResponse.json({ error: "Valid Solana recipient required" }, { status: 400 });
    }

    const amountLamports =
      body.amountSol != null && body.amountSol.trim() !== ""
        ? parseSolToLamports(body.amountSol)
        : undefined;

    const result = await adminWithdrawProtocolFees({ to, amountLamports });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Withdraw failed";
    console.error("[admin/solana/withdraw-protocol]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

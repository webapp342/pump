import { NextResponse, type NextRequest } from "next/server";
import { readSessionSubject } from "@/lib/auth/wallet-session";
import {
  getOrCreateSolanaWallet,
  getSolanaWalletForSubject,
} from "@/lib/solana/solana-wallet-server";

/**
 * GET — return Solana wallet if it exists (no create).
 * POST — get-or-create Solana Ed25519 wallet for the current OIDC session.
 * User pays SOL network fees; secret returned for client-side signing (EVM /me parity).
 */
export async function GET(request: NextRequest) {
  try {
    const subject = readSessionSubject(request);
    if (!subject) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const wallet = await getSolanaWalletForSubject(subject);
    if (!wallet) {
      return NextResponse.json({ data: null }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      {
        data: {
          address: wallet.address,
          secretKeyBase64: wallet.secretKeyBase64,
          authProvider: wallet.authProvider,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const subject = readSessionSubject(request);
    if (!subject) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const wallet = await getOrCreateSolanaWallet(subject);
    return NextResponse.json(
      {
        data: {
          address: wallet.address,
          secretKeyBase64: wallet.secretKeyBase64,
          authProvider: wallet.authProvider,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

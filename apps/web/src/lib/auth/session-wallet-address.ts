import type { NextRequest } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { isSolanaChainFamily } from "@/config/chain-family";
import { readSessionSubject, loadWalletSessionFromRequest } from "@/lib/auth/wallet-session";
import { getSolanaWalletForSubject } from "@/lib/solana/solana-wallet-server";

/** True when the signed-in session owns this wallet address (Solana base58 or EVM SCW). */
export async function sessionOwnsWalletAddress(
  request: NextRequest,
  addressRaw: string | null | undefined
): Promise<boolean> {
  const address = normalizeAddressParam(addressRaw);
  if (!address) return false;

  if (isSolanaChainFamily) {
    const subject = readSessionSubject(request);
    if (!subject) return false;
    const wallet = await getSolanaWalletForSubject(subject);
    return wallet?.address === address;
  }

  const session = await loadWalletSessionFromRequest(request);
  if (!session) return false;
  return session.scwAddress.toLowerCase() === address;
}

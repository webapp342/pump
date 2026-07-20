/**
 * Read pending creator / referrer fee PDAs (Base pendingCreatorFees parity).
 * Safe for server + client — no silent wallet / signing imports.
 */

import { PublicKey } from "@solana/web3.js";
import {
  decodePendingFees,
  pdaCreatorFees,
  pdaReferrerFees,
} from "@/lib/solana/launchpad-pdas";
import { getSolanaConnection } from "@/lib/solana/transfer";

export async function fetchPendingCreatorFeesLamports(
  ownerAddress: string
): Promise<bigint> {
  try {
    const owner = new PublicKey(ownerAddress);
    const [pda] = pdaCreatorFees(owner);
    const info = await getSolanaConnection().getAccountInfo(pda, "confirmed");
    if (!info?.data) return 0n;
    return decodePendingFees(info.data).pendingLamports;
  } catch {
    return 0n;
  }
}

export async function fetchPendingReferrerFeesLamports(
  ownerAddress: string
): Promise<bigint> {
  try {
    const owner = new PublicKey(ownerAddress);
    const [pda] = pdaReferrerFees(owner);
    const info = await getSolanaConnection().getAccountInfo(pda, "confirmed");
    if (!info?.data) return 0n;
    return decodePendingFees(info.data).pendingLamports;
  } catch {
    return 0n;
  }
}

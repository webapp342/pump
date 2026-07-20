/**
 * Silent claim of pending creator / referrer fees (Base claimCreatorFees parity).
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  encodeClaimCreatorFeesIx,
  encodeClaimReferrerFeesIx,
} from "@pump/solana-sdk";
import { sendSolanaSilentTransaction } from "@/lib/solana/send-silent-transaction";
import {
  hydrateSolanaSilentSession,
  getSolanaSilentSession,
} from "@/lib/solana/silent-session";
import {
  launchpadProgramId,
  pdaCreatorFees,
  pdaGlobal,
  pdaLiquidityVault,
  pdaReferrerFees,
} from "@/lib/solana/launchpad-pdas";
import {
  fetchPendingCreatorFeesLamports,
  fetchPendingReferrerFeesLamports,
} from "@/lib/solana/pending-fees";

export {
  fetchPendingCreatorFeesLamports,
  fetchPendingReferrerFeesLamports,
} from "@/lib/solana/pending-fees";

async function claimerPubkey(): Promise<PublicKey> {
  const s = getSolanaSilentSession() ?? (await hydrateSolanaSilentSession());
  return new PublicKey(s.address);
}

export async function silentClaimCreatorFees(): Promise<{
  signature: string;
  amountLamports: bigint;
}> {
  const claimer = await claimerPubkey();
  const pending = await fetchPendingCreatorFeesLamports(claimer.toBase58());
  if (pending <= 0n) throw new Error("No creator fees to claim");

  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [liquidity] = pdaLiquidityVault(programId);
  const [pendingFees] = pdaCreatorFees(claimer, programId);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: claimer, isSigner: true, isWritable: true },
      { pubkey: globalPda, isSigner: false, isWritable: false },
      { pubkey: liquidity, isSigner: false, isWritable: true },
      { pubkey: pendingFees, isSigner: false, isWritable: true },
    ],
    data: encodeClaimCreatorFeesIx(),
  });

  const { signature } = await sendSolanaSilentTransaction([ix]);
  return { signature, amountLamports: pending };
}

export async function silentClaimReferrerFees(): Promise<{
  signature: string;
  amountLamports: bigint;
}> {
  const claimer = await claimerPubkey();
  const pending = await fetchPendingReferrerFeesLamports(claimer.toBase58());
  if (pending <= 0n) throw new Error("No referrer fees to claim");

  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [liquidity] = pdaLiquidityVault(programId);
  const [pendingFees] = pdaReferrerFees(claimer, programId);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: claimer, isSigner: true, isWritable: true },
      { pubkey: globalPda, isSigner: false, isWritable: false },
      { pubkey: liquidity, isSigner: false, isWritable: true },
      { pubkey: pendingFees, isSigner: false, isWritable: true },
    ],
    data: encodeClaimReferrerFeesIx(),
  });

  const { signature } = await sendSolanaSilentTransaction([ix]);
  return { signature, amountLamports: pending };
}

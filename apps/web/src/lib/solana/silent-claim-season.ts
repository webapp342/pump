import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { encodeClaimSeasonRewardsIx } from "@pump/solana-sdk";
import { sendSolanaSilentTransaction } from "@/lib/solana/send-silent-transaction";
import {
  hydrateSolanaSilentSession,
  getSolanaSilentSession,
} from "@/lib/solana/silent-session";
import {
  decodeSeasonReward,
  launchpadProgramId,
  pdaGlobal,
  pdaLiquidityVault,
  pdaSeasonRewards,
} from "@/lib/solana/launchpad-pdas";
import { getSolanaConnection } from "@/lib/solana/transfer";

async function claimerPubkey(): Promise<PublicKey> {
  const s = getSolanaSilentSession() ?? (await hydrateSolanaSilentSession());
  return new PublicKey(s.address);
}

export async function fetchPendingSeasonRewardsLamports(
  ownerAddress: string,
  seasonId: number
): Promise<bigint> {
  try {
    const owner = new PublicKey(ownerAddress);
    const [pda] = pdaSeasonRewards(owner, seasonId);
    const info = await getSolanaConnection().getAccountInfo(pda, "confirmed");
    if (!info?.data) return 0n;
    const reward = decodeSeasonReward(info.data);
    if (reward.seasonId !== seasonId) return 0n;
    return reward.pendingLamports;
  } catch {
    return 0n;
  }
}

export async function silentClaimSeasonRewards(seasonId: number): Promise<{
  signature: string;
  amountLamports: bigint;
}> {
  if (!Number.isFinite(seasonId) || seasonId <= 0) {
    throw new Error("Invalid season id");
  }
  const claimer = await claimerPubkey();
  const pending = await fetchPendingSeasonRewardsLamports(
    claimer.toBase58(),
    seasonId
  );
  if (pending <= 0n) throw new Error("No season rewards to claim");

  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [liquidity] = pdaLiquidityVault(programId);
  const [seasonReward] = pdaSeasonRewards(claimer, seasonId, programId);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: claimer, isSigner: true, isWritable: true },
      { pubkey: globalPda, isSigner: false, isWritable: false },
      { pubkey: liquidity, isSigner: false, isWritable: true },
      { pubkey: seasonReward, isSigner: false, isWritable: true },
    ],
    data: encodeClaimSeasonRewardsIx(seasonId),
  });

  const { signature } = await sendSolanaSilentTransaction([ix]);
  return { signature, amountLamports: pending };
}

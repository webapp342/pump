/**
 * Instruction builders for live fee estimation (must mirror silent-trade sends).
 */

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { encodeBuyIx, encodeSellIx } from "@pump/solana-sdk";
import {
  type OnchainCurve,
  launchpadProgramId,
  pdaGlobal,
  pdaReferrerBinding,
  pdaTreasuryVault,
} from "@/lib/solana/launchpad-pdas";

export function buildSolanaBuyInstructions(input: {
  trader: PublicKey;
  mint: PublicKey;
  curvePda: PublicKey;
  curve: OnchainCurve;
  solInLamports: bigint;
  minTokenOut: bigint;
  includeAtaCreate: boolean;
}): TransactionInstruction[] {
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [treasury] = pdaTreasuryVault(programId);
  const [referrerBinding] = pdaReferrerBinding(input.trader);
  const traderAta = getAssociatedTokenAddressSync(
    input.mint,
    input.trader,
    false,
    TOKEN_PROGRAM_ID
  );

  const ixs: TransactionInstruction[] = [];
  if (input.includeAtaCreate) {
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        input.trader,
        traderAta,
        input.trader,
        input.mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  ixs.push(
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: input.trader, isSigner: true, isWritable: true },
        { pubkey: globalPda, isSigner: false, isWritable: false },
        { pubkey: input.curvePda, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: input.curve.creator, isSigner: false, isWritable: true },
        { pubkey: input.mint, isSigner: false, isWritable: false },
        { pubkey: input.curve.tokenVault, isSigner: false, isWritable: true },
        { pubkey: traderAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: referrerBinding, isSigner: false, isWritable: false },
        { pubkey: input.trader, isSigner: false, isWritable: true },
      ],
      data: encodeBuyIx(input.solInLamports, input.minTokenOut),
    })
  );
  return ixs;
}

export function buildSolanaSellInstructions(input: {
  trader: PublicKey;
  mint: PublicKey;
  curvePda: PublicKey;
  curve: OnchainCurve;
  tokenIn: bigint;
  minSolOut: bigint;
}): TransactionInstruction[] {
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [treasury] = pdaTreasuryVault(programId);
  const [referrerBinding] = pdaReferrerBinding(input.trader);
  const traderAta = getAssociatedTokenAddressSync(
    input.mint,
    input.trader,
    false,
    TOKEN_PROGRAM_ID
  );

  return [
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: input.trader, isSigner: true, isWritable: true },
        { pubkey: globalPda, isSigner: false, isWritable: false },
        { pubkey: input.curvePda, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: input.curve.creator, isSigner: false, isWritable: true },
        { pubkey: input.mint, isSigner: false, isWritable: false },
        { pubkey: input.curve.tokenVault, isSigner: false, isWritable: true },
        { pubkey: traderAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: referrerBinding, isSigner: false, isWritable: false },
        { pubkey: input.trader, isSigner: false, isWritable: true },
      ],
      data: encodeSellIx(input.tokenIn, input.minSolOut),
    }),
  ];
}

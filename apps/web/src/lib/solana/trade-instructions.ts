/**
 * Instruction builders for live fee estimation (must mirror silent-trade sends).
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { encodeBuyIx, encodeSellIx } from "@pump/solana-sdk";
import {
  type OnchainCurve,
  launchpadProgramId,
  pdaProtocolTreasury,
} from "@/lib/solana/launchpad-pdas";
import { solanaTradeAccountMetas } from "@/lib/solana/trade-accounts";

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
      keys: solanaTradeAccountMetas({
        trader: input.trader,
        mint: input.mint,
        curvePda: input.curvePda,
        curve: input.curve,
        traderAta,
      }),
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
  /** When true, append CloseAccount → protocol_treasury (full-sell rent reclaim). */
  closeAtaToProtocolTreasury?: boolean;
}): TransactionInstruction[] {
  const programId = launchpadProgramId();
  const traderAta = getAssociatedTokenAddressSync(
    input.mint,
    input.trader,
    false,
    TOKEN_PROGRAM_ID
  );

  const ixs: TransactionInstruction[] = [
    new TransactionInstruction({
      programId,
      keys: solanaTradeAccountMetas({
        trader: input.trader,
        mint: input.mint,
        curvePda: input.curvePda,
        curve: input.curve,
        traderAta,
      }),
      data: encodeSellIx(input.tokenIn, input.minSolOut),
    }),
  ];

  if (input.closeAtaToProtocolTreasury) {
    const [protocolTreasury] = pdaProtocolTreasury(programId);
    ixs.push(
      createCloseAccountInstruction(
        traderAta,
        protocolTreasury,
        input.trader,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  return ixs;
}

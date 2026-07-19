/**
 * Silent buy/sell against Pinocchio pump-launchpad.
 * No wallet popup — custodial Keypair signs in-process.
 */

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { encodeBuyIx, encodeSellIx } from "@pump/solana-sdk";
import { getSolanaConnection } from "@/lib/solana/transfer";
import { sendSolanaSilentTransaction } from "@/lib/solana/send-silent-transaction";
import {
  hydrateSolanaSilentSession,
  getSolanaSilentSession,
} from "@/lib/solana/silent-session";
import {
  decodeCurveAccount,
  launchpadProgramId,
  pdaCurve,
  pdaGlobal,
  pdaTreasuryVault,
} from "@/lib/solana/launchpad-pdas";

export type SolanaSilentTradeResult = {
  signature: string;
  traderAddress: string;
};

async function traderPubkey(): Promise<PublicKey> {
  const s = getSolanaSilentSession() ?? (await hydrateSolanaSilentSession());
  return new PublicKey(s.address);
}

async function loadCurve(mint: PublicKey) {
  const conn = getSolanaConnection();
  const [curvePda] = pdaCurve(mint);
  const info = await conn.getAccountInfo(curvePda, "confirmed");
  if (!info?.data) {
    throw new Error("Curve not found for this mint");
  }
  return {
    curvePda,
    curve: decodeCurveAccount(Buffer.from(info.data)),
  };
}

/**
 * Buy tokens with SOL — popup-free.
 * Ensures trader ATA exists (idempotent create in same tx).
 */
export async function silentBuy(input: {
  mintAddress: string;
  solInLamports: bigint;
  minTokenOut: bigint;
}): Promise<SolanaSilentTradeResult> {
  if (input.solInLamports <= 0n) throw new Error("Amount must be greater than zero");
  const trader = await traderPubkey();
  const mint = new PublicKey(input.mintAddress);
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [treasury] = pdaTreasuryVault(programId);
  const { curvePda, curve } = await loadCurve(mint);

  if (curve.paused) throw new Error("Trading paused");
  if (!curve.mint.equals(mint)) throw new Error("Mint mismatch");

  const traderAta = getAssociatedTokenAddressSync(mint, trader, false, TOKEN_PROGRAM_ID);
  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      trader,
      traderAta,
      trader,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: trader, isSigner: true, isWritable: true },
        { pubkey: globalPda, isSigner: false, isWritable: false },
        { pubkey: curvePda, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: curve.creator, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: curve.tokenVault, isSigner: false, isWritable: true },
        { pubkey: traderAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeBuyIx(input.solInLamports, input.minTokenOut),
    }),
  ];

  const { signature } = await sendSolanaSilentTransaction(ixs);
  return { signature, traderAddress: trader.toBase58() };
}

/**
 * Sell tokens for SOL — popup-free (no separate approve; token authority = trader).
 */
export async function silentSell(input: {
  mintAddress: string;
  tokenIn: bigint;
  minSolOut: bigint;
}): Promise<SolanaSilentTradeResult> {
  if (input.tokenIn <= 0n) throw new Error("Amount must be greater than zero");
  const trader = await traderPubkey();
  const mint = new PublicKey(input.mintAddress);
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [treasury] = pdaTreasuryVault(programId);
  const { curvePda, curve } = await loadCurve(mint);

  if (curve.paused) throw new Error("Trading paused");

  const traderAta = getAssociatedTokenAddressSync(mint, trader, false, TOKEN_PROGRAM_ID);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: trader, isSigner: true, isWritable: true },
      { pubkey: globalPda, isSigner: false, isWritable: false },
      { pubkey: curvePda, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: curve.creator, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: curve.tokenVault, isSigner: false, isWritable: true },
      { pubkey: traderAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeSellIx(input.tokenIn, input.minSolOut),
  });

  const { signature } = await sendSolanaSilentTransaction([ix]);
  return { signature, traderAddress: trader.toBase58() };
}

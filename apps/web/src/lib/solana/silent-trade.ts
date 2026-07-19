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
import { encodeBuyIx, encodeSellIx, encodeSetReferrerIx } from "@pump/solana-sdk";
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
  pdaReferrerBinding,
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

async function maybeSetReferrer(
  trader: PublicKey,
  referrerAddress: string | null | undefined
): Promise<TransactionInstruction | null> {
  if (!referrerAddress || referrerAddress === trader.toBase58()) return null;
  let referrer: PublicKey;
  try {
    referrer = new PublicKey(referrerAddress);
  } catch {
    return null;
  }
  if (referrer.equals(trader)) return null;

  const programId = launchpadProgramId();
  const [binding] = pdaReferrerBinding(trader);
  const conn = getSolanaConnection();
  const existing = await conn.getAccountInfo(binding, "confirmed");
  if (existing && existing.data.length >= 65) {
    return null;
  }

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: trader, isSigner: true, isWritable: true },
      { pubkey: referrer, isSigner: false, isWritable: false },
      { pubkey: binding, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeSetReferrerIx(),
  });
}

/**
 * Buy tokens with SOL — popup-free.
 * Ensures trader ATA exists (idempotent create in same tx).
 */
export async function silentBuy(input: {
  mintAddress: string;
  solInLamports: bigint;
  minTokenOut: bigint;
  referrerAddress?: string | null;
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

  const [referrerBinding] = pdaReferrerBinding(trader);
  const referrerWallet =
    input.referrerAddress &&
    input.referrerAddress !== trader.toBase58()
      ? new PublicKey(input.referrerAddress)
      : trader;

  const traderAta = getAssociatedTokenAddressSync(mint, trader, false, TOKEN_PROGRAM_ID);
  const setRefIx = await maybeSetReferrer(trader, input.referrerAddress);
  const ixs: TransactionInstruction[] = [];
  if (setRefIx) ixs.push(setRefIx);
  ixs.push(
    createAssociatedTokenAccountIdempotentInstruction(
      trader,
      traderAta,
      trader,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  ixs.push(
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
        { pubkey: referrerBinding, isSigner: false, isWritable: false },
        { pubkey: referrerWallet, isSigner: false, isWritable: true },
      ],
      data: encodeBuyIx(input.solInLamports, input.minTokenOut),
    })
  );

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
  referrerAddress?: string | null;
}): Promise<SolanaSilentTradeResult> {
  if (input.tokenIn <= 0n) throw new Error("Amount must be greater than zero");
  const trader = await traderPubkey();
  const mint = new PublicKey(input.mintAddress);
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [treasury] = pdaTreasuryVault(programId);
  const { curvePda, curve } = await loadCurve(mint);

  if (curve.paused) throw new Error("Trading paused");

  const [referrerBinding] = pdaReferrerBinding(trader);
  const referrerWallet =
    input.referrerAddress &&
    input.referrerAddress !== trader.toBase58()
      ? new PublicKey(input.referrerAddress)
      : trader;

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
      { pubkey: referrerBinding, isSigner: false, isWritable: false },
      { pubkey: referrerWallet, isSigner: false, isWritable: true },
    ],
    data: encodeSellIx(input.tokenIn, input.minSolOut),
  });

  const { signature } = await sendSolanaSilentTransaction([ix]);
  return { signature, traderAddress: trader.toBase58() };
}

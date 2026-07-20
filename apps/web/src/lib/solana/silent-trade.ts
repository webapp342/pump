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
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { encodeBuyIx, encodeSellIx, encodeSetReferrerIx } from "@pump/solana-sdk";
import { getSolanaConnection } from "@/lib/solana/transfer";
import { sendSolanaSilentTransaction } from "@/lib/solana/send-silent-transaction";
import { getLiveTransactionFeeLamports } from "@/lib/solana/tx-fee";
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

/** Must match programs/pump-launchpad set_referrer CreateAccount lamports. */
const REFERRER_BINDING_RENT_LAMPORTS = 1_500_000n;

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
    curve: decodeCurveAccount(info.data),
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

function formatSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Live affordability check against the signing wallet (not a cached UI balance).
 */
async function assertBuyAffordable(input: {
  trader: PublicKey;
  solInLamports: bigint;
  ixs: TransactionInstruction[];
  needsAta: boolean;
  needsReferrerBinding: boolean;
}): Promise<void> {
  const conn = getSolanaConnection();
  const [balance, ataRent, walletRent, txFee] = await Promise.all([
    conn.getBalance(input.trader, "confirmed").then(BigInt),
    input.needsAta
      ? conn.getMinimumBalanceForRentExemption(ACCOUNT_SIZE).then(BigInt)
      : Promise.resolve(0n),
    conn.getMinimumBalanceForRentExemption(0).then(BigInt),
    getLiveTransactionFeeLamports(conn, input.ixs, input.trader),
  ]);

  const bindingRent = input.needsReferrerBinding ? REFERRER_BINDING_RENT_LAMPORTS : 0n;
  const required =
    input.solInLamports + ataRent + bindingRent + txFee + walletRent;

  if (balance >= required) return;

  throw new Error(
    `Insufficient funds: wallet has ${formatSol(balance)} SOL, need ${formatSol(required)} SOL ` +
      `(buy ${formatSol(input.solInLamports)}` +
      `${ataRent > 0n ? ` + token account ${formatSol(ataRent)}` : ""}` +
      `${bindingRent > 0n ? ` + referrer account ${formatSol(bindingRent)}` : ""}` +
      ` + fee ${formatSol(txFee)} + keep ${formatSol(walletRent)}).`
  );
}

/**
 * Buy tokens with SOL — popup-free.
 * Creates trader ATA only when missing; preflights live balance on the signer.
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
  if (curve.complete) throw new Error("Curve complete — trading closed");
  if (!curve.mint.equals(mint)) throw new Error("Mint mismatch");
  if (curve.realTokenReserves <= 0n) {
    throw new Error("No tokens left on the bonding curve for this coin.");
  }

  // Vault must hold tokens — empty vault surfaces as SPL "insufficient funds" otherwise.
  const conn = getSolanaConnection();
  const vaultBal = await conn.getTokenAccountBalance(curve.tokenVault, "confirmed").catch(() => null);
  const vaultRaw = vaultBal?.value?.amount ? BigInt(vaultBal.value.amount) : 0n;
  if (vaultRaw <= 0n) {
    throw new Error("Token vault is empty — this coin was not minted correctly. Create again.");
  }

  const [referrerBinding] = pdaReferrerBinding(trader);
  const referrerWallet =
    input.referrerAddress &&
    input.referrerAddress !== trader.toBase58()
      ? new PublicKey(input.referrerAddress)
      : trader;

  const traderAta = getAssociatedTokenAddressSync(mint, trader, false, TOKEN_PROGRAM_ID);
  const [ataInfo, setRefIx] = await Promise.all([
    conn.getAccountInfo(traderAta, "confirmed"),
    maybeSetReferrer(trader, input.referrerAddress),
  ]);
  const needsAta = ataInfo === null;

  const ixs: TransactionInstruction[] = [];
  if (setRefIx) ixs.push(setRefIx);
  if (needsAta) {
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
  }
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

  await assertBuyAffordable({
    trader,
    solInLamports: input.solInLamports,
    ixs,
    needsAta,
    needsReferrerBinding: setRefIx !== null,
  });

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

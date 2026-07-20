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
  createCloseAccountInstruction,
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
  pdaCreatorFees,
  pdaCurve,
  pdaProtocolTreasury,
  pdaReferrerBinding,
  pdaReferrerFees,
} from "@/lib/solana/launchpad-pdas";
import { solanaTradeAccountMetas } from "@/lib/solana/trade-accounts";
import {
  SOLANA_BUY_FEE_SLACK_LAMPORTS,
  SOLANA_PENDING_FEES_RENT_LAMPORTS,
  SOLANA_REFERRER_BINDING_RENT_LAMPORTS,
} from "@/lib/solana/amount-scale";

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

function accountNeedsInit(info: { lamports: number; data: Uint8Array } | null): boolean {
  return info == null || info.lamports === 0;
}

/**
 * Live affordability check against the signing wallet (not a cached UI balance).
 * Includes ATA / referrer binding / pending fee PDA rents the buy ix may create.
 */
async function assertBuyAffordable(input: {
  trader: PublicKey;
  solInLamports: bigint;
  ixs: TransactionInstruction[];
  needsAta: boolean;
  needsReferrerBinding: boolean;
  needsCreatorFeesPda: boolean;
  needsReferrerFeesPda: boolean;
}): Promise<void> {
  const conn = getSolanaConnection();
  const [balance, ataRent, txFee] = await Promise.all([
    conn.getBalance(input.trader, "confirmed").then(BigInt),
    input.needsAta
      ? conn.getMinimumBalanceForRentExemption(ACCOUNT_SIZE).then(BigInt)
      : Promise.resolve(0n),
    getLiveTransactionFeeLamports(conn, input.ixs, input.trader),
  ]);

  const bindingRent = input.needsReferrerBinding ? SOLANA_REFERRER_BINDING_RENT_LAMPORTS : 0n;
  const creatorFeesRent = input.needsCreatorFeesPda ? SOLANA_PENDING_FEES_RENT_LAMPORTS : 0n;
  const referrerFeesRent = input.needsReferrerFeesPda ? SOLANA_PENDING_FEES_RENT_LAMPORTS : 0n;
  // No wallet rent-exempt floor — only fee + accounts this buy creates.
  const required =
    input.solInLamports +
    ataRent +
    bindingRent +
    creatorFeesRent +
    referrerFeesRent +
    txFee +
    SOLANA_BUY_FEE_SLACK_LAMPORTS;

  if (balance >= required) return;

  throw new Error(
    `Insufficient funds: wallet has ${formatSol(balance)} SOL, need ${formatSol(required)} SOL ` +
      `(buy ${formatSol(input.solInLamports)}` +
      `${ataRent > 0n ? ` + token account ${formatSol(ataRent)}` : ""}` +
      `${bindingRent > 0n ? ` + referrer account ${formatSol(bindingRent)}` : ""}` +
      `${creatorFeesRent > 0n ? ` + creator fees account ${formatSol(creatorFeesRent)}` : ""}` +
      `${referrerFeesRent > 0n ? ` + referrer fees account ${formatSol(referrerFeesRent)}` : ""}` +
      ` + fee ${formatSol(txFee)}).`
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
  const { curvePda, curve } = await loadCurve(mint);

  if (curve.paused) throw new Error("Trading paused");
  if (curve.complete) throw new Error("Curve complete — trading closed");
  if (!curve.mint.equals(mint)) throw new Error("Mint mismatch");
  if (curve.realTokenReserves <= 0n) {
    throw new Error("No tokens left on the bonding curve for this coin.");
  }

  const conn = getSolanaConnection();
  const vaultBal = await conn.getTokenAccountBalance(curve.tokenVault, "confirmed").catch(() => null);
  const vaultRaw = vaultBal?.value?.amount ? BigInt(vaultBal.value.amount) : 0n;
  if (vaultRaw <= 0n) {
    throw new Error("Token vault is empty — this coin was not minted correctly. Create again.");
  }

  const referrerWallet =
    input.referrerAddress &&
    input.referrerAddress !== trader.toBase58()
      ? new PublicKey(input.referrerAddress)
      : trader;

  const traderAta = getAssociatedTokenAddressSync(mint, trader, false, TOKEN_PROGRAM_ID);
  const [creatorFeesPda] = pdaCreatorFees(curve.creator, programId);
  const [referrerFeesPda] = pdaReferrerFees(referrerWallet, programId);

  const [ataInfo, setRefIx, creatorFeesInfo, referrerFeesInfo] = await Promise.all([
    conn.getAccountInfo(traderAta, "confirmed"),
    maybeSetReferrer(trader, input.referrerAddress),
    conn.getAccountInfo(creatorFeesPda, "confirmed"),
    referrerWallet.equals(trader)
      ? Promise.resolve(null)
      : conn.getAccountInfo(referrerFeesPda, "confirmed"),
  ]);
  const needsAta = ataInfo === null;
  const needsCreatorFeesPda = accountNeedsInit(creatorFeesInfo);
  const needsReferrerFeesPda =
    !referrerWallet.equals(trader) && accountNeedsInit(referrerFeesInfo);

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
      keys: solanaTradeAccountMetas({
        trader,
        mint,
        curvePda,
        curve,
        traderAta,
        referrerWallet,
      }),
      data: encodeBuyIx(input.solInLamports, input.minTokenOut),
    })
  );

  await assertBuyAffordable({
    trader,
    solInLamports: input.solInLamports,
    ixs,
    needsAta,
    needsReferrerBinding: setRefIx !== null,
    needsCreatorFeesPda,
    needsReferrerFeesPda,
  });

  const { signature } = await sendSolanaSilentTransaction(ixs);
  return { signature, traderAddress: trader.toBase58() };
}

/**
 * Sell tokens for SOL — popup-free (no separate approve; token authority = trader).
 * Full sell closes the trader ATA and sends rent (~0.002 SOL) to protocol_treasury PDA.
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
  const { curvePda, curve } = await loadCurve(mint);

  if (curve.paused) throw new Error("Trading paused");

  const referrerWallet =
    input.referrerAddress &&
    input.referrerAddress !== trader.toBase58()
      ? new PublicKey(input.referrerAddress)
      : trader;

  const traderAta = getAssociatedTokenAddressSync(mint, trader, false, TOKEN_PROGRAM_ID);
  const conn = getSolanaConnection();
  const ataBal = await conn.getTokenAccountBalance(traderAta, "confirmed").catch(() => null);
  const rawBal = ataBal?.value?.amount != null ? BigInt(ataBal.value.amount) : 0n;
  if (rawBal > 0n && input.tokenIn > rawBal) {
    throw new Error("Insufficient token balance");
  }

  const ixs: TransactionInstruction[] = [
    new TransactionInstruction({
      programId: launchpadProgramId(),
      keys: solanaTradeAccountMetas({
        trader,
        mint,
        curvePda,
        curve,
        traderAta,
        referrerWallet,
      }),
      data: encodeSellIx(input.tokenIn, input.minSolOut),
    }),
  ];

  // Empty ATA after full sell → reclaim rent to protocol treasury (not the trader).
  if (rawBal > 0n && input.tokenIn >= rawBal) {
    const [protocolTreasury] = pdaProtocolTreasury();
    ixs.push(
      createCloseAccountInstruction(
        traderAta,
        protocolTreasury,
        trader,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  const { signature } = await sendSolanaSilentTransaction(ixs);
  return { signature, traderAddress: trader.toBase58() };
}

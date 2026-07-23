/**
 * Popup-free Solana token launch (create_meme + optional initial buy).
 * Creates Metaplex metadata (name/symbol/uri) in the same transaction for cross-platform visibility.
 */

import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type Connection,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { encodeBuyIx, encodeCreateMemeIx, LAUNCHPAD_PROGRAM_RENT_LAMPORTS, PUMP_FEEL_DEFAULTS } from "@pump/solana-sdk";
import { getSolanaConnection } from "@/lib/solana/transfer";
import { getLiveTransactionFeeLamports } from "@/lib/solana/tx-fee";
import { sendSolanaSilentTransaction } from "@/lib/solana/send-silent-transaction";
import {
  hydrateSolanaSilentSession,
  getSolanaSilentSession,
} from "@/lib/solana/silent-session";
import {
  buildTokenMetaplexJsonUrl,
  createSplTokenMetadataInstruction,
  estimateMetaplexMetadataRentLamports,
} from "@/lib/solana/metaplex-metadata";
import {
  decodeGlobalConfig,
  launchpadProgramId,
  pdaCurve,
  pdaFactorySigner,
  pdaGlobal,
  pdaLiquidityVault,
  pdaReferrerBinding,
} from "@/lib/solana/launchpad-pdas";
import { solanaTradeAccountMetas } from "@/lib/solana/trade-accounts";
import { fetchWeeklyXpForTrade } from "@/lib/xp/fetch-weekly-xp-for-trade";

export type SolanaSilentCreateResult = {
  signature: string;
  mintAddress: string;
  traderAddress: string;
};

async function creatorPubkey(): Promise<PublicKey> {
  const s = getSolanaSilentSession() ?? (await hydrateSolanaSilentSession());
  return new PublicKey(s.address);
}

function referrerAccounts(trader: PublicKey, referrerAddress?: string | null) {
  const [referrerBinding] = pdaReferrerBinding(trader);
  let referrerWallet = trader;
  if (referrerAddress) {
    try {
      const ref = new PublicKey(referrerAddress);
      if (!ref.equals(trader)) referrerWallet = ref;
    } catch {
      // ignore invalid referrer
    }
  }
  return { referrerBinding, referrerWallet };
}

async function buildCreateMemeInstructions(input: {
  creator: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  tokenDecimals: number;
  initialBuyLamports?: bigint;
  minTokenOut?: bigint;
  referrerAddress?: string | null;
}): Promise<TransactionInstruction[]> {
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [factorySigner] = pdaFactorySigner(programId);
  const [liquidity] = pdaLiquidityVault(programId);
  const [curvePda] = pdaCurve(input.mint, programId);
  // Token vault ATA owned by shared liquidity PDA (Base: tokens on manager).
  const vault = getAssociatedTokenAddressSync(input.mint, liquidity, true, TOKEN_PROGRAM_ID);
  const conn = getSolanaConnection();
  const mintRent = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);

  const ixs: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: input.creator,
      newAccountPubkey: input.mint,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      input.mint,
      input.tokenDecimals,
      input.creator,
      null,
      TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      input.creator,
      vault,
      liquidity,
      input.mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createSplTokenMetadataInstruction({
      mint: input.mint,
      mintAuthority: input.creator,
      payer: input.creator,
      updateAuthority: input.creator,
      name: input.name,
      symbol: input.symbol,
      uri: input.uri,
    }),
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: input.creator, isSigner: true, isWritable: true },
        { pubkey: input.mint, isSigner: true, isWritable: true },
        { pubkey: curvePda, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: factorySigner, isSigner: false, isWritable: false },
        { pubkey: globalPda, isSigner: false, isWritable: false },
        { pubkey: liquidity, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeCreateMemeIx({
        name: input.name,
        symbol: input.symbol,
        uri: input.uri,
      }),
    }),
  ];

  const initialBuy = input.initialBuyLamports ?? 0n;
  if (initialBuy > 0n) {
    const traderAta = getAssociatedTokenAddressSync(
      input.mint,
      input.creator,
      false,
      TOKEN_PROGRAM_ID
    );
    const minOut = input.minTokenOut ?? 1n;
    const userXp = await fetchWeeklyXpForTrade(input.creator.toBase58());
    const { referrerWallet } = referrerAccounts(
      input.creator,
      input.referrerAddress
    );
    const curvePlaceholder = {
      mint: input.mint,
      creator: input.creator,
      tokenVault: vault,
      virtualTokenReserves: 0n,
      virtualSolReserves: 0n,
      realTokenReserves: 0n,
      realSolReserves: 0n,
      tokenTotalSupply: 0n,
      initialRealTokenReserves: 0n,
      complete: 0,
      paused: 0,
      bump: 0,
    };
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        input.creator,
        traderAta,
        input.creator,
        input.mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      new TransactionInstruction({
        programId,
        keys: solanaTradeAccountMetas({
          trader: input.creator,
          mint: input.mint,
          curvePda,
          curve: curvePlaceholder,
          traderAta,
          referrerWallet,
        }),
        data: encodeBuyIx(initialBuy, minOut, userXp),
      })
    );
  }

  return ixs;
}

export async function silentCreateMeme(input: {
  name: string;
  symbol: string;
  uri?: string;
  initialBuyLamports?: bigint;
  minTokenOut?: bigint;
  referrerAddress?: string | null;
}): Promise<SolanaSilentCreateResult> {
  const trimmedName = input.name.trim();
  const trimmedSymbol = input.symbol.trim().toUpperCase();
  if (!trimmedName || !trimmedSymbol) {
    throw new Error("Name and symbol are required.");
  }

  const creator = await creatorPubkey();
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const metadataUri =
    input.uri?.trim() || buildTokenMetaplexJsonUrl(mint.toBase58());

  const conn = getSolanaConnection();
  const globalInfo = await conn.getAccountInfo(pdaGlobal()[0], "confirmed");
  if (!globalInfo?.data) throw new Error("Launchpad not initialized on-chain");
  const global = decodeGlobalConfig(globalInfo.data);

  const ixs = await buildCreateMemeInstructions({
    creator,
    mint,
    name: trimmedName,
    symbol: trimmedSymbol,
    uri: metadataUri,
    tokenDecimals: global.tokenDecimals,
    initialBuyLamports: input.initialBuyLamports,
    minTokenOut: input.minTokenOut,
    referrerAddress: input.referrerAddress,
  });

  const { signature } = await sendSolanaSilentTransaction(ixs, {
    extraSigners: [mintKp],
  });

  return {
    signature,
    mintAddress: mint.toBase58(),
    traderAddress: creator.toBase58(),
  };
}

const TOKEN_ACCOUNT_LEN = ACCOUNT_SIZE;

/**
 * Pump.fun-style create cost: platform fee (usually 0) + Solana rent + tx fee.
 * Does not include optional initial buy amount.
 */
export async function estimateSolanaCreateCostLamports(options?: {
  initialBuyLamports?: bigint;
  connection?: Connection;
  feePayer?: PublicKey | string;
  name?: string;
  symbol?: string;
}): Promise<bigint> {
  const conn = options?.connection ?? getSolanaConnection();
  const [globalPda] = pdaGlobal();
  const globalInfo = await conn.getAccountInfo(globalPda, "confirmed");
  const createFeeLamports = globalInfo?.data
    ? decodeGlobalConfig(globalInfo.data).createFeeLamports
    : PUMP_FEEL_DEFAULTS.createFeeLamports;
  const tokenDecimals = globalInfo?.data
    ? decodeGlobalConfig(globalInfo.data).tokenDecimals
    : PUMP_FEEL_DEFAULTS.tokenDecimals;

  const estimateMint = Keypair.generate();
  const feePayer = new PublicKey(
    options?.feePayer ?? estimateMint.publicKey
  );
  const placeholderName = options?.name?.trim() || "Estimate";
  const placeholderSymbol = options?.symbol?.trim().toUpperCase() || "EST";
  const metadataUri = buildTokenMetaplexJsonUrl(estimateMint.publicKey.toBase58());

  const [mintRent, vaultRent, metadataRent, txFeeLamports] = await Promise.all([
    conn.getMinimumBalanceForRentExemption(MINT_SIZE),
    conn.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN),
    estimateMetaplexMetadataRentLamports(conn, {
      mint: estimateMint.publicKey,
      updateAuthority: feePayer,
      name: placeholderName,
      symbol: placeholderSymbol,
      uri: metadataUri,
    }),
    buildCreateMemeInstructions({
      creator: feePayer,
      mint: estimateMint.publicKey,
      name: placeholderName,
      symbol: placeholderSymbol,
      uri: metadataUri,
      tokenDecimals,
      initialBuyLamports: options?.initialBuyLamports,
      minTokenOut: 1n,
    }).then((ixs) => getLiveTransactionFeeLamports(conn, ixs, feePayer)),
  ]);

  let total =
    BigInt(mintRent + vaultRent + metadataRent) +
    LAUNCHPAD_PROGRAM_RENT_LAMPORTS.curve +
    txFeeLamports +
    createFeeLamports;

  const initialBuy = options?.initialBuyLamports ?? 0n;
  if (initialBuy > 0n) {
    const traderAtaRent = await conn.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN);
    total += BigInt(traderAtaRent) + initialBuy;
  }

  return total;
}

/** @deprecated Use estimateSolanaCreateCostLamports. */
export async function solanaCreateFeeCushionLamports(): Promise<bigint> {
  return estimateSolanaCreateCostLamports();
}

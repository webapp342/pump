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
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { encodeBuyIx, encodeCreateMemeIx, LAUNCHPAD_ACCOUNT_LEN, PUMP_FEEL_DEFAULTS, SOLANA_BASE_TX_FEE_LAMPORTS } from "@pump/solana-sdk";
import { getSolanaConnection } from "@/lib/solana/transfer";
import { sendSolanaSilentTransaction } from "@/lib/solana/send-silent-transaction";
import {
  hydrateSolanaSilentSession,
  getSolanaSilentSession,
} from "@/lib/solana/silent-session";
import {
  buildTokenMetaplexJsonUrl,
  createSplTokenMetadataInstruction,
} from "@/lib/solana/metaplex-metadata";
import {
  decodeGlobalConfig,
  launchpadProgramId,
  pdaCurve,
  pdaFactorySigner,
  pdaGlobal,
  pdaReferrerBinding,
  pdaTreasuryVault,
} from "@/lib/solana/launchpad-pdas";

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
  const programId = launchpadProgramId();
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const metadataUri =
    input.uri?.trim() || buildTokenMetaplexJsonUrl(mint.toBase58());

  const [globalPda] = pdaGlobal(programId);
  const [factorySigner] = pdaFactorySigner(programId);
  const [treasury] = pdaTreasuryVault(programId);
  const [curvePda] = pdaCurve(mint, programId);
  const vault = getAssociatedTokenAddressSync(mint, curvePda, true, TOKEN_PROGRAM_ID);

  const conn = getSolanaConnection();
  const globalInfo = await conn.getAccountInfo(globalPda, "confirmed");
  if (!globalInfo?.data) throw new Error("Launchpad not initialized on-chain");
  const global = decodeGlobalConfig(globalInfo.data);

  const mintRent = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);

  const ixs: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: creator,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mint,
      global.tokenDecimals,
      creator,
      null,
      TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      creator,
      vault,
      curvePda,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createSplTokenMetadataInstruction({
      mint,
      mintAuthority: creator,
      payer: creator,
      updateAuthority: creator,
      name: trimmedName,
      symbol: trimmedSymbol,
      uri: metadataUri,
    }),
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: creator, isSigner: true, isWritable: true },
        { pubkey: mint, isSigner: true, isWritable: true },
        { pubkey: curvePda, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: factorySigner, isSigner: false, isWritable: false },
        { pubkey: globalPda, isSigner: false, isWritable: false },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeCreateMemeIx({
        name: trimmedName,
        symbol: trimmedSymbol,
        uri: metadataUri,
      }),
    }),
  ];

  const initialBuy = input.initialBuyLamports ?? 0n;
  if (initialBuy > 0n) {
    const traderAta = getAssociatedTokenAddressSync(mint, creator, false, TOKEN_PROGRAM_ID);
    const minOut = input.minTokenOut ?? 1n;
    const { referrerBinding, referrerWallet } = referrerAccounts(
      creator,
      input.referrerAddress
    );
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        creator,
        traderAta,
        creator,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      new TransactionInstruction({
        programId,
        keys: [
          { pubkey: creator, isSigner: true, isWritable: true },
          { pubkey: globalPda, isSigner: false, isWritable: false },
          { pubkey: curvePda, isSigner: false, isWritable: true },
          { pubkey: treasury, isSigner: false, isWritable: true },
          { pubkey: creator, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: traderAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: referrerBinding, isSigner: false, isWritable: false },
          { pubkey: referrerWallet, isSigner: false, isWritable: true },
        ],
        data: encodeBuyIx(initialBuy, minOut),
      })
    );
  }

  const { signature } = await sendSolanaSilentTransaction(ixs, {
    extraSigners: [mintKp],
  });

  return {
    signature,
    mintAddress: mint.toBase58(),
    traderAddress: creator.toBase58(),
  };
}

const TOKEN_ACCOUNT_LEN = 165;

/**
 * Pump.fun-style create cost: platform fee (usually 0) + Solana rent + tx fee.
 * Does not include optional initial buy amount.
 */
export async function estimateSolanaCreateCostLamports(options?: {
  initialBuyLamports?: bigint;
  connection?: Connection;
}): Promise<bigint> {
  const conn = options?.connection ?? getSolanaConnection();
  const [globalPda] = pdaGlobal();
  const globalInfo = await conn.getAccountInfo(globalPda, "confirmed");
  const createFeeLamports = globalInfo?.data
    ? decodeGlobalConfig(globalInfo.data).createFeeLamports
    : PUMP_FEEL_DEFAULTS.createFeeLamports;

  const [mintRent, vaultRent, curveRent, metadataRent] = await Promise.all([
    conn.getMinimumBalanceForRentExemption(MINT_SIZE),
    conn.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN),
    conn.getMinimumBalanceForRentExemption(LAUNCHPAD_ACCOUNT_LEN.curve),
    conn.getMinimumBalanceForRentExemption(LAUNCHPAD_ACCOUNT_LEN.metadata),
  ]);

  let total =
    BigInt(mintRent + vaultRent + curveRent + metadataRent) +
    SOLANA_BASE_TX_FEE_LAMPORTS +
    createFeeLamports;

  const initialBuy = options?.initialBuyLamports ?? 0n;
  if (initialBuy > 0n) {
    const traderAtaRent = await conn.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN);
    total += BigInt(traderAtaRent) + initialBuy;
  }

  return total;
}

/** @deprecated Use estimateSolanaCreateCostLamports — kept for callers during migration. */
export function solanaCreateFeeCushionLamports(): bigint {
  // Sync fallback only; UI should call estimateSolanaCreateCostLamports.
  return (
    BigInt(1_461_600 + 2_039_280 + 1_893_120 + 5_616_720) +
    SOLANA_BASE_TX_FEE_LAMPORTS +
    PUMP_FEEL_DEFAULTS.createFeeLamports
  );
}

/**
 * Popup-free Solana token launch (create_meme + optional initial buy).
 */

import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { encodeBuyIx, encodeCreateMemeIx, PUMP_FEEL_DEFAULTS } from "@pump/solana-sdk";
import { getSolanaConnection } from "@/lib/solana/transfer";
import { sendSolanaSilentTransaction } from "@/lib/solana/send-silent-transaction";
import {
  hydrateSolanaSilentSession,
  getSolanaSilentSession,
} from "@/lib/solana/silent-session";
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

export async function silentCreateMeme(input?: {
  initialBuyLamports?: bigint;
  minTokenOut?: bigint;
  referrerAddress?: string | null;
}): Promise<SolanaSilentCreateResult> {
  const creator = await creatorPubkey();
  const programId = launchpadProgramId();
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const [globalPda] = pdaGlobal(programId);
  const [factorySigner] = pdaFactorySigner(programId);
  const [treasury] = pdaTreasuryVault(programId);
  const [curvePda] = pdaCurve(mint, programId);
  const vault = getAssociatedTokenAddressSync(mint, curvePda, true, TOKEN_PROGRAM_ID);

  const conn = getSolanaConnection();
  const globalInfo = await conn.getAccountInfo(globalPda, "confirmed");
  if (!globalInfo?.data) throw new Error("Launchpad not initialized on-chain");
  const global = decodeGlobalConfig(Buffer.from(globalInfo.data));

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
      factorySigner,
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
      data: encodeCreateMemeIx(),
    }),
  ];

  const initialBuy = input?.initialBuyLamports ?? 0n;
  if (initialBuy > 0n) {
    const traderAta = getAssociatedTokenAddressSync(mint, creator, false, TOKEN_PROGRAM_ID);
    const minOut = input?.minTokenOut ?? 1n;
    const { referrerBinding, referrerWallet } = referrerAccounts(
      creator,
      input?.referrerAddress
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

/** Rent + curve allocation cushion for create UX (matches on-chain ~3M lamports curve + mint rent). */
export function solanaCreateFeeCushionLamports(): bigint {
  return PUMP_FEEL_DEFAULTS.createFeeLamports + 5_000_000n;
}

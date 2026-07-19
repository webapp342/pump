/**
 * Popup-free Solana tx send using custodial Keypair (feePayer = user).
 * Mirrors EVM Kernel UserOp path UX: click → sign in-app → confirm on-chain.
 */

import {
  Connection,
  Keypair,
  Transaction,
  type TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getSolanaConnection, keypairFromSecretBase64 } from "@/lib/solana/transfer";
import {
  getSolanaSilentSession,
  hydrateSolanaSilentSession,
} from "@/lib/solana/silent-session";

export type SilentSendResult = {
  signature: string;
};

async function resolveSigner(): Promise<Keypair> {
  const s = getSolanaSilentSession() ?? (await hydrateSolanaSilentSession());
  return keypairFromSecretBase64(s.secretKeyBase64);
}

/**
 * Build, sign, and confirm a transaction with the custodial key.
 * No wallet extension / no approval modal.
 */
export async function sendSolanaSilentTransaction(
  instructions: TransactionInstruction[],
  options?: {
    connection?: Connection;
    /** Additional signers (e.g. ephemeral mint keypair on create). */
    extraSigners?: Keypair[];
  }
): Promise<SilentSendResult> {
  if (instructions.length === 0) {
    throw new Error("No instructions to send");
  }
  const payer = await resolveSigner();
  const conn = options?.connection ?? getSolanaConnection();
  const tx = new Transaction().add(...instructions);
  tx.feePayer = payer.publicKey;

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  const signers = [payer, ...(options?.extraSigners ?? [])];
  const signature = await sendAndConfirmTransaction(conn, tx, signers, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  return { signature };
}

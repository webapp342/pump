/**
 * Live Solana base transaction fee via RPC (no hardcoded lamport guess).
 */

import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

/** Query the cluster fee schedule for an exact instruction set + fee payer. */
export async function getLiveTransactionFeeLamports(
  connection: Connection,
  instructions: TransactionInstruction[],
  feePayer: PublicKey
): Promise<bigint> {
  if (instructions.length === 0) return 0n;

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer, recentBlockhash: blockhash });
  tx.add(...instructions);

  const response = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
  if (response.value == null) {
    throw new Error("Transaction fee unavailable from RPC");
  }
  return BigInt(response.value);
}

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { SOLANA_RPC_URL } from "@/config/solana";
import { secretKeyFromBase64 } from "@/lib/solana/keypair";

let sharedConnection: Connection | null = null;

export function getSolanaConnection(): Connection {
  if (!sharedConnection) {
    sharedConnection = new Connection(SOLANA_RPC_URL, "confirmed");
  }
  return sharedConnection;
}

export function keypairFromSecretBase64(secretKeyBase64: string): Keypair {
  return Keypair.fromSecretKey(secretKeyFromBase64(secretKeyBase64));
}

export async function fetchSolBalanceLamports(address: string): Promise<bigint> {
  const conn = getSolanaConnection();
  const lamports = await conn.getBalance(new PublicKey(address), "confirmed");
  return BigInt(lamports);
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): bigint {
  if (!Number.isFinite(sol) || sol <= 0) return 0n;
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}

/** Leave a small cushion for future rent/fees after withdraw. */
export const SOL_WITHDRAW_FEE_CUSHION_LAMPORTS = 5_000n;

export async function computeMaxSolWithdrawLamports(balanceLamports: bigint): Promise<bigint> {
  if (balanceLamports <= SOL_WITHDRAW_FEE_CUSHION_LAMPORTS) return 0n;
  return balanceLamports - SOL_WITHDRAW_FEE_CUSHION_LAMPORTS;
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(address.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Transfer SOL from custodial key to `to`. User pays network fee (feePayer = from).
 * Returns transaction signature.
 */
export async function withdrawSol(input: {
  secretKeyBase64: string;
  to: string;
  lamports: bigint;
}): Promise<string> {
  if (input.lamports <= 0n) throw new Error("Amount must be greater than zero");
  if (!isValidSolanaAddress(input.to)) throw new Error("Invalid Solana address");

  const from = keypairFromSecretBase64(input.secretKeyBase64);
  const toPubkey = new PublicKey(input.to.trim());
  if (toPubkey.equals(from.publicKey)) {
    throw new Error("Destination must differ from your wallet");
  }

  const conn = getSolanaConnection();
  const balance = BigInt(await conn.getBalance(from.publicKey, "confirmed"));
  const max = await computeMaxSolWithdrawLamports(balance);
  if (input.lamports > max) {
    throw new Error("Insufficient SOL (keep a small balance for fees)");
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey,
      lamports: Number(input.lamports),
    })
  );

  const sig = await sendAndConfirmTransaction(conn, tx, [from], {
    commitment: "confirmed",
  });
  return sig;
}

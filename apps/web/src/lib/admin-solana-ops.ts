/**
 * Authority-signed Solana treasury ops for admin console.
 * Keypair must match GlobalConfig.authority (same wallet used for initialize).
 *
 * Env (first match):
 *   SOLANA_AUTHORITY_SECRET_BASE64 — 64-byte secret as base64
 *   SOLANA_AUTHORITY_KEYPAIR / ANCHOR_WALLET — path to solana-keygen JSON
 */

import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { encodeEmergencySweepIx, encodeWithdrawIx } from "@pump/solana-sdk";
import { SOLANA_RPC_URL } from "@/config/solana";
import {
  decodeGlobalConfig,
  launchpadProgramId,
  pdaGlobal,
  withdrawableLamports,
} from "@/lib/solana/launchpad-pdas";
import { keypairFromSecretBase64 } from "@/lib/solana/transfer";

function expandHome(p: string): string {
  return p.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "");
}

export function loadSolanaAuthorityKeypair(): Keypair {
  const b64 = process.env.SOLANA_AUTHORITY_SECRET_BASE64?.trim();
  if (b64) {
    return keypairFromSecretBase64(b64);
  }

  const path =
    process.env.SOLANA_AUTHORITY_KEYPAIR?.trim() ||
    process.env.ANCHOR_WALLET?.trim() ||
    `${process.env.HOME || process.env.USERPROFILE}/.config/solana/id.json`;

  const raw = JSON.parse(readFileSync(expandHome(path), "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function loadGlobal(conn: Connection) {
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const info = await conn.getAccountInfo(globalPda, "confirmed");
  if (!info?.data) {
    throw new Error("Global account missing — run solana:initialize");
  }
  const global = decodeGlobalConfig(info.data);
  return { programId, globalPda, global };
}

function assertAuthority(authority: PublicKey, signer: Keypair) {
  if (!authority.equals(signer.publicKey)) {
    throw new Error(
      `Authority keypair ${signer.publicKey.toBase58()} does not match Global.authority ${authority.toBase58()}`
    );
  }
}

/** Withdraw protocol fees from protocol-treasury PDA → `to` (Base LaunchpadTreasury.withdrawNative). */
export async function adminWithdrawProtocolFees(input: {
  to: string;
  /** Lamports; omit / 0 = max withdrawable (balance − rent). */
  amountLamports?: bigint;
}): Promise<{ signature: string; amountLamports: bigint; to: string }> {
  const authority = loadSolanaAuthorityKeypair();
  const conn = new Connection(SOLANA_RPC_URL, "confirmed");
  const { programId, globalPda, global } = await loadGlobal(conn);
  assertAuthority(global.authority, authority);

  const to = new PublicKey(input.to.trim());
  const bal = BigInt(await conn.getBalance(global.protocolTreasury, "confirmed"));
  const max = withdrawableLamports(bal);
  if (max <= 0n) throw new Error("No withdrawable protocol fees (rent floor only)");

  const amount =
    input.amountLamports != null && input.amountLamports > 0n
      ? input.amountLamports
      : max;
  if (amount > max) {
    throw new Error(`Amount exceeds withdrawable ${max} lamports`);
  }

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: globalPda, isSigner: false, isWritable: false },
      { pubkey: global.protocolTreasury, isSigner: false, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
    ],
    data: encodeWithdrawIx(amount),
  });

  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority], {
    commitment: "confirmed",
  });
  return { signature: sig, amountLamports: amount, to: to.toBase58() };
}

/**
 * Emergency drain of shared liquidity vault → `to` + halt trading
 * (Base emergencySweepAllEth). Default `to` should be Global.authority (deployer).
 */
export async function adminEmergencySweepLiquidity(input: {
  to: string;
}): Promise<{ signature: string; to: string }> {
  const authority = loadSolanaAuthorityKeypair();
  const conn = new Connection(SOLANA_RPC_URL, "confirmed");
  const { programId, globalPda, global } = await loadGlobal(conn);
  assertAuthority(global.authority, authority);

  const to = new PublicKey(input.to.trim());
  const bal = BigInt(await conn.getBalance(global.liquidity, "confirmed"));
  if (withdrawableLamports(bal) <= 0n) {
    throw new Error("No withdrawable liquidity (rent floor only)");
  }

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: globalPda, isSigner: false, isWritable: true },
      { pubkey: global.liquidity, isSigner: false, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
    ],
    data: encodeEmergencySweepIx(),
  });

  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority], {
    commitment: "confirmed",
  });
  return { signature: sig, to: to.toBase58() };
}

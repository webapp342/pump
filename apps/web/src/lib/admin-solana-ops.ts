/**
 * Authority-signed Solana treasury ops for admin console.
 * Keypair must match GlobalConfig.authority (same wallet used for initialize).
 *
 * Env (first match):
 *   SOLANA_AUTHORITY_SECRET_BASE64 — 64-byte secret as base64
 *   SOLANA_AUTHORITY_KEYPAIR / ANCHOR_WALLET — path to solana-keygen JSON
 */

import { existsSync, readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  encodeEmergencyClaimPendingFeesIx,
  encodeEmergencySweepIx,
  encodeWithdrawIx,
  NATIVE_DECIMALS,
} from "@pump/solana-sdk";
import { SOLANA_RPC_URL } from "@/config/solana";
import {
  decodeGlobalConfig,
  decodePendingFees,
  launchpadProgramId,
  pdaCreatorFees,
  pdaGlobal,
  pdaReferrerFees,
  withdrawableLamports,
} from "@/lib/solana/launchpad-pdas";
import { keypairFromSecretBase64 } from "@/lib/solana/transfer";

function expandHome(p: string): string {
  return p.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "");
}

const AUTHORITY_ENV_HINT =
  "Set SOLANA_AUTHORITY_SECRET_BASE64 (preferred) or SOLANA_AUTHORITY_KEYPAIR / ANCHOR_WALLET to the Global.authority keypair JSON on the API host.";

export function loadSolanaAuthorityKeypair(): Keypair {
  const b64 = process.env.SOLANA_AUTHORITY_SECRET_BASE64?.trim();
  if (b64) {
    try {
      return keypairFromSecretBase64(b64);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`SOLANA_AUTHORITY_SECRET_BASE64 invalid: ${detail}`);
    }
  }

  const path =
    process.env.SOLANA_AUTHORITY_KEYPAIR?.trim() ||
    process.env.ANCHOR_WALLET?.trim() ||
    "";

  if (!path) {
    throw new Error(
      `Solana authority keypair not configured. ${AUTHORITY_ENV_HINT} ` +
        `(default ~/.config/solana/id.json is not used on the server unless you set the path explicitly.)`
    );
  }

  const resolved = expandHome(path);
  if (!existsSync(resolved)) {
    throw new Error(
      `Solana authority keypair file missing: ${resolved}. ${AUTHORITY_ENV_HINT}`
    );
  }

  try {
    const raw = JSON.parse(readFileSync(resolved, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read authority keypair at ${resolved}: ${detail}`);
  }
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

const PENDING_FEES_ACCOUNT_LEN = 48;

function formatSolFromLamports(lamports: bigint): string {
  const base = 10n ** BigInt(NATIVE_DECIMALS);
  const whole = lamports / base;
  const frac = (lamports % base).toString().padStart(NATIVE_DECIMALS, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
}

export type PendingFeeRow = {
  kind: "creator" | "referrer";
  owner: string;
  pda: string;
  pendingLamports: string;
  pendingSol: string;
};

/** Scan program PendingFees PDAs with pending_lamports > 0. */
export async function listPendingFeeAccounts(): Promise<PendingFeeRow[]> {
  const conn = new Connection(SOLANA_RPC_URL, "confirmed");
  const programId = launchpadProgramId();
  const accounts = await conn.getProgramAccounts(programId, {
    commitment: "confirmed",
    filters: [{ dataSize: PENDING_FEES_ACCOUNT_LEN }],
  });

  const rows: PendingFeeRow[] = [];
  for (const { pubkey, account } of accounts) {
    let decoded;
    try {
      decoded = decodePendingFees(account.data);
    } catch {
      continue;
    }
    if (decoded.pendingLamports <= 0n) continue;

    const owner = decoded.owner;
    const [creatorPda] = pdaCreatorFees(owner, programId);
    const [referrerPda] = pdaReferrerFees(owner, programId);
    let kind: "creator" | "referrer" | null = null;
    if (pubkey.equals(creatorPda)) kind = "creator";
    else if (pubkey.equals(referrerPda)) kind = "referrer";
    if (!kind) continue;

    rows.push({
      kind,
      owner: owner.toBase58(),
      pda: pubkey.toBase58(),
      pendingLamports: decoded.pendingLamports.toString(),
      pendingSol: formatSolFromLamports(decoded.pendingLamports),
    });
  }

  rows.sort((a, b) => {
    const diff = BigInt(b.pendingLamports) - BigInt(a.pendingLamports);
    if (diff > 0n) return 1;
    if (diff < 0n) return -1;
    return a.owner.localeCompare(b.owner);
  });
  return rows;
}

/**
 * Authority sweeps one creator/referrer pending balance from liquidity → `to`.
 * Requires on-chain IX 9 (program upgrade).
 */
export async function adminEmergencyClaimPendingFees(input: {
  owner: string;
  kind: "creator" | "referrer";
  to: string;
}): Promise<{
  signature: string;
  amountLamports: bigint;
  owner: string;
  kind: "creator" | "referrer";
  to: string;
}> {
  const authority = loadSolanaAuthorityKeypair();
  const conn = new Connection(SOLANA_RPC_URL, "confirmed");
  const { programId, globalPda, global } = await loadGlobal(conn);
  assertAuthority(global.authority, authority);

  const owner = new PublicKey(input.owner.trim());
  const to = new PublicKey(input.to.trim());
  const [pendingPda] =
    input.kind === "creator" ? pdaCreatorFees(owner, programId) : pdaReferrerFees(owner, programId);

  const info = await conn.getAccountInfo(pendingPda, "confirmed");
  if (!info?.data) {
    throw new Error(`Pending fees PDA missing for ${input.kind} ${owner.toBase58()}`);
  }
  const pending = decodePendingFees(info.data);
  if (pending.pendingLamports <= 0n) {
    throw new Error("No pending fees to sweep");
  }
  if (!pending.owner.equals(owner)) {
    throw new Error("Pending fees owner mismatch");
  }

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: globalPda, isSigner: false, isWritable: false },
      { pubkey: global.liquidity, isSigner: false, isWritable: true },
      { pubkey: pendingPda, isSigner: false, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
    ],
    data: encodeEmergencyClaimPendingFeesIx(),
  });

  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority], {
    commitment: "confirmed",
  });
  return {
    signature: sig,
    amountLamports: pending.pendingLamports,
    owner: owner.toBase58(),
    kind: input.kind,
    to: to.toBase58(),
  };
}

/** Sweep every PendingFees PDA with balance > 0 (sequential txs). */
export async function adminEmergencyClaimAllPendingFees(input: {
  to: string;
}): Promise<{
  to: string;
  swept: number;
  totalLamports: bigint;
  results: Array<{
    owner: string;
    kind: "creator" | "referrer";
    signature: string;
    amountLamports: bigint;
  }>;
  errors: Array<{ owner: string; kind: "creator" | "referrer"; error: string }>;
}> {
  const rows = await listPendingFeeAccounts();
  const results: Array<{
    owner: string;
    kind: "creator" | "referrer";
    signature: string;
    amountLamports: bigint;
  }> = [];
  const errors: Array<{ owner: string; kind: "creator" | "referrer"; error: string }> = [];
  let totalLamports = 0n;

  for (const row of rows) {
    try {
      const r = await adminEmergencyClaimPendingFees({
        owner: row.owner,
        kind: row.kind,
        to: input.to,
      });
      results.push({
        owner: r.owner,
        kind: r.kind,
        signature: r.signature,
        amountLamports: r.amountLamports,
      });
      totalLamports += r.amountLamports;
    } catch (err) {
      errors.push({
        owner: row.owner,
        kind: row.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    to: input.to.trim(),
    swept: results.length,
    totalLamports,
    results,
    errors,
  };
}

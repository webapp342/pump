import { getLaunchpadPool } from "@/lib/db/launchpad";
import { decryptSecretBytes, encryptSecretBytes } from "@/lib/wallet-key-crypto";
import {
  addressFromSecretKey,
  secretKeyFromBase64,
  type SolanaKeypairMaterial,
} from "@/lib/solana/keypair";

export type SolanaAuthProvider = "telegram" | "google" | "apple" | "guest";

export type SolanaWalletRow = {
  authProvider: SolanaAuthProvider;
  authSubject: string;
  address: string;
  /** 64-byte secret, base64 — same encoding returned to client. */
  secretKeyBase64: string;
};

type DbRow = {
  auth_provider: SolanaAuthProvider;
  auth_subject: string;
  address: string;
  encrypted_secret_key: string;
};

function mapRow(row: DbRow): SolanaWalletRow {
  const secret = decryptSecretBytes(row.encrypted_secret_key);
  return {
    authProvider: row.auth_provider,
    authSubject: row.auth_subject,
    address: row.address,
    secretKeyBase64: secret.toString("base64"),
  };
}

export async function getSolanaWallet(
  authProvider: SolanaAuthProvider,
  authSubject: string
): Promise<SolanaWalletRow | null> {
  const db = getLaunchpadPool();
  const result = await db.query<DbRow>(
    `
    SELECT auth_provider, auth_subject, address, encrypted_secret_key
    FROM solana_wallets
    WHERE auth_provider = $1 AND auth_subject = $2
    `,
    [authProvider, authSubject]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function insertSolanaWallet(input: {
  authProvider: SolanaAuthProvider;
  authSubject: string;
  material: SolanaKeypairMaterial;
}): Promise<SolanaWalletRow> {
  const db = getLaunchpadPool();
  const encrypted = encryptSecretBytes(Buffer.from(input.material.secretKey));
  const result = await db.query<DbRow>(
    `
    INSERT INTO solana_wallets (
      auth_provider, auth_subject, address, encrypted_secret_key
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (auth_provider, auth_subject) DO NOTHING
    RETURNING auth_provider, auth_subject, address, encrypted_secret_key
    `,
    [input.authProvider, input.authSubject, input.material.address, encrypted]
  );

  if (result.rows[0]) return mapRow(result.rows[0]);

  const existing = await getSolanaWallet(input.authProvider, input.authSubject);
  if (!existing) throw new Error("Failed to create Solana wallet");
  return existing;
}

/** Verify decrypted material still matches stored address (integrity). */
export function assertSolanaWalletIntegrity(row: SolanaWalletRow): void {
  const sk = secretKeyFromBase64(row.secretKeyBase64);
  const derived = addressFromSecretKey(sk);
  if (derived !== row.address) {
    throw new Error("Solana wallet address mismatch");
  }
}

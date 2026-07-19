import { generateSolanaKeypair } from "@/lib/solana/keypair";
import {
  assertSolanaWalletIntegrity,
  getSolanaWallet,
  insertSolanaWallet,
  type SolanaAuthProvider,
  type SolanaWalletRow,
} from "@/lib/db/solana-wallets";
import type { SessionSubject } from "@/lib/auth/session-subject";

export type SolanaWalletCredentials = {
  authProvider: SolanaAuthProvider;
  authSubject: string;
  address: string;
  secretKeyBase64: string;
};

function subjectToAuth(
  subject: SessionSubject
): { authProvider: SolanaAuthProvider; authSubject: string } {
  if (subject.kind === "telegram") {
    return { authProvider: "telegram", authSubject: subject.telegramId };
  }
  return { authProvider: subject.provider, authSubject: subject.subject };
}

function toCreds(row: SolanaWalletRow): SolanaWalletCredentials {
  assertSolanaWalletIntegrity(row);
  return {
    authProvider: row.authProvider,
    authSubject: row.authSubject,
    address: row.address,
    secretKeyBase64: row.secretKeyBase64,
  };
}

/** Get or create Solana Ed25519 wallet for the logged-in OIDC subject. */
export async function getOrCreateSolanaWallet(
  subject: SessionSubject
): Promise<SolanaWalletCredentials> {
  const { authProvider, authSubject } = subjectToAuth(subject);
  const existing = await getSolanaWallet(authProvider, authSubject);
  if (existing) return toCreds(existing);

  const material = generateSolanaKeypair();
  const row = await insertSolanaWallet({
    authProvider,
    authSubject,
    material,
  });
  return toCreds(row);
}

export async function getSolanaWalletForSubject(
  subject: SessionSubject
): Promise<SolanaWalletCredentials | null> {
  const { authProvider, authSubject } = subjectToAuth(subject);
  const row = await getSolanaWallet(authProvider, authSubject);
  return row ? toCreds(row) : null;
}

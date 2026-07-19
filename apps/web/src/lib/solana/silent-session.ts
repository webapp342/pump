/**
 * In-memory Solana custodial session (EVM Kernel privateKey parity).
 * Never persists secret to localStorage — only RAM for the tab lifetime.
 * Signing is local Keypair — no Phantom / wallet-adapter popup.
 */

import type { SolanaWalletClientPayload } from "@/lib/solana/pump-solana-account";
import {
  ensureSolanaWalletClient,
  fetchSolanaWalletClient,
} from "@/lib/solana/pump-solana-account";

export type SolanaSilentSession = SolanaWalletClientPayload;

let session: SolanaSilentSession | null = null;
let hydratePromise: Promise<SolanaSilentSession> | null = null;

export function getSolanaSilentSession(): SolanaSilentSession | null {
  return session;
}

export function clearSolanaSilentSession(): void {
  session = null;
  hydratePromise = null;
}

/**
 * Ensure Ed25519 wallet exists for OIDC session and cache secret in memory.
 * Safe to call repeatedly (deduped).
 */
export async function hydrateSolanaSilentSession(): Promise<SolanaSilentSession> {
  if (session) return session;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const existing = await fetchSolanaWalletClient();
    const wallet = existing ?? (await ensureSolanaWalletClient());
    session = wallet;
    return wallet;
  })().finally(() => {
    hydratePromise = null;
  });

  return hydratePromise;
}

/** Force refresh from API (e.g. after re-login). */
export async function refreshSolanaSilentSession(): Promise<SolanaSilentSession> {
  clearSolanaSilentSession();
  return hydrateSolanaSilentSession();
}

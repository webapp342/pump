/**
 * Client helper: ensure Solana wallet exists for the logged-in session.
 * Call after OIDC login when CHAIN_FAMILY=solana (or dual-prep).
 */
export type SolanaWalletClientPayload = {
  address: string;
  secretKeyBase64: string;
  authProvider: string;
};

export async function ensureSolanaWalletClient(): Promise<SolanaWalletClientPayload> {
  const res = await fetch("/api/auth/solana/wallet", {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const body = (await res.json()) as {
    data?: SolanaWalletClientPayload | null;
    error?: string;
  };
  if (!res.ok || !body.data) {
    throw new Error(body.error ?? "Could not create Solana wallet");
  }
  return body.data;
}

export async function fetchSolanaWalletClient(): Promise<SolanaWalletClientPayload | null> {
  const res = await fetch("/api/auth/solana/wallet", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return null;
  const body = (await res.json()) as {
    data?: SolanaWalletClientPayload | null;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? "Could not load Solana wallet");
  return body.data ?? null;
}

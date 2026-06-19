import { pumpChain } from "@/config/chain";

/** Pimlico bundler RPC — server key must never ship in client bundles for production abuse limits. */
export function getPimlicoBundlerUrl(): string {
  const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  if (apiKey && apiKey !== "CHANGE_ME") {
    return `https://api.pimlico.io/v2/${pumpChain.id}/rpc?apikey=${apiKey}`;
  }
  // Public endpoint for local dev without keys — rate-limited, not for production.
  return `https://public.pimlico.io/v2/${pumpChain.id}/rpc`;
}

export function hasPimlicoApiKey(): boolean {
  const key = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  return Boolean(key && key !== "CHANGE_ME");
}

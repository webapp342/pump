import { CHAIN_ID } from "@/config/chain";

/** Pimlico chain slug (mainnet BSC uses `bsc`, testnet uses numeric id). */
function pimlicoChainSlug(chainId: number): string {
  if (chainId === 56) return "bsc";
  return String(chainId);
}

/** Build Pimlico bundler RPC URL for the active chain. */
export function getPimlicoBundlerUrl(apiKey?: string): string {
  const slug = pimlicoChainSlug(CHAIN_ID);
  const key = apiKey?.trim();
  if (key) {
    return `https://api.pimlico.io/v2/${slug}/rpc?apikey=${encodeURIComponent(key)}`;
  }
  return `https://public.pimlico.io/v2/${slug}/rpc`;
}

/** Client-visible bundler RPC URL (defaults to same-origin Next.js proxy). */
export function getBundlerRpcUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BUNDLER_RPC_URL?.trim();
  if (configured && configured !== "CHANGE_ME") {
    if (configured.startsWith("/")) {
      if (typeof window !== "undefined") {
        return `${window.location.origin}${configured}`;
      }
      return configured;
    }
    return configured;
  }

  const publicKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY?.trim();
  if (publicKey) {
    return getPimlicoBundlerUrl(publicKey);
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/bundler/rpc`;
  }
  return "/api/bundler/rpc";
}

/** Server-side bundler upstream (Pimlico via /api/bundler/rpc proxy). */
export function getBundlerUpstreamUrl(): string {
  const explicit = process.env.BUNDLER_RPC_URL?.trim();
  if (explicit && explicit !== "CHANGE_ME") {
    return explicit;
  }

  const serverKey = process.env.PIMLICO_API_KEY?.trim();
  if (serverKey) {
    return getPimlicoBundlerUrl(serverKey);
  }

  return getPimlicoBundlerUrl();
}

export function isBundlerConfigured(): boolean {
  return Boolean(getBundlerUpstreamUrl());
}

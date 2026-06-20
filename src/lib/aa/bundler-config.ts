import { CHAIN_ID } from "@/config/chain";

const DEFAULT_ALTO_URL = "http://127.0.0.1:4337/rpc";

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

  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/bundler/rpc`;
  }
  return "/api/bundler/rpc";
}

/** Server-side bundler upstream (self-hosted Alto on VM by default). */
export function getBundlerUpstreamUrl(): string {
  const explicit = process.env.BUNDLER_RPC_URL?.trim();
  if (explicit && explicit !== "CHANGE_ME") {
    return explicit;
  }

  return DEFAULT_ALTO_URL;
}

export function isBundlerConfigured(): boolean {
  return Boolean(getBundlerUpstreamUrl());
}

/** For docs / health checks only. */
export function getBundlerChainId(): number {
  return CHAIN_ID;
}

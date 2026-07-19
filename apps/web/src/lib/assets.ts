import { getAddress } from "viem";
import { normalizeTokenAddress } from "@/lib/address";
import { isSolanaChainFamily } from "@/config/chain-family";

const ASSETS_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ASSETS_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ASSETS_CDN) ||
  "https://assets.example.com";

const CACHE_BUST =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ASSETS_CACHE_BUST) || "v=1";

/** Filename / CDN key for token logos — canonical base58 on Solana, lowercase 0x on EVM. */
export function tokenLogoStorageKey(address: string): string {
  if (isSolanaChainFamily) {
    return normalizeTokenAddress(address);
  }
  return getAddress(address).toLowerCase();
}

export function getLaunchpadTokenLogoUrl(address: string): string {
  const path = `/icons/tokens/${tokenLogoStorageKey(address)}.png?${CACHE_BUST}`;
  if (ASSETS_BASE) {
    return `${ASSETS_BASE.replace(/\/$/, "")}${path}`;
  }
  return path;
}

export function resolveLaunchpadLogoUri(
  logoUrl: string | null | undefined,
  address: string
): string {
  if (logoUrl?.trim()) {
    if (logoUrl.startsWith("http") || logoUrl.startsWith("/")) return logoUrl.trim();
    return getLaunchpadTokenLogoUrl(address);
  }
  return getLaunchpadTokenLogoUrl(address);
}

export function stripLogoCacheBust(url: string): string {
  return url.split("?")[0] ?? url;
}

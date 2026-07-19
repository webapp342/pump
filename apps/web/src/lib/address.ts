import { getAddress, isAddress } from "viem";
import { PublicKey } from "@solana/web3.js";
import { isSolanaChainFamily } from "@/config/chain-family";

function toEvmCandidate(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) return trimmed;
  if (/^[0-9a-fA-F]{40}$/.test(trimmed)) return `0x${trimmed}`;
  return trimmed;
}

function normalizeSolanaAddress(value: string): string | null {
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    return null;
  }
}

/** Normalize wallet/token address for DB queries and API params. */
export function normalizeAddressParam(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  if (isSolanaChainFamily) {
    return normalizeSolanaAddress(value);
  }
  const candidate = toEvmCandidate(value);
  try {
    if (!isAddress(candidate)) return null;
    return getAddress(candidate).toLowerCase();
  } catch {
    return null;
  }
}

/** Normalize token address for persistence (case-sensitive base58 on Solana). */
export function normalizeTokenAddress(value: string): string {
  if (isSolanaChainFamily) {
    const normalized = normalizeSolanaAddress(value);
    if (!normalized) throw new Error("Invalid Solana mint address");
    return normalized;
  }
  return getAddress(value).toLowerCase();
}

export function isValidAddressParam(value: string | null | undefined): boolean {
  return normalizeAddressParam(value) != null;
}

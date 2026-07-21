import { isAddress } from "viem";
import { PublicKey } from "@solana/web3.js";
import { isSolanaChainFamily } from "@/config/chain-family";

export const REFERRAL_STORAGE_KEY = "pump-referral-ref";

export function normalizeReferrer(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isSolanaChainFamily) {
    try {
      return new PublicKey(trimmed).toBase58();
    } catch {
      return null;
    }
  }
  if (!isAddress(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function readStoredReferrer(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeReferrer(sessionStorage.getItem(REFERRAL_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearStoredReferrer(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function captureReferrerFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = normalizeReferrer(params.get("ref"));
    if (!ref) return;
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, ref);

    params.delete("ref");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  } catch {
    // ignore
  }
}

const ZERO_EVM = "0x0000000000000000000000000000000000000000";

function isSelfReferral(referrer: string, traderAddress: string): boolean {
  if (isSolanaChainFamily) return referrer === traderAddress;
  return referrer.toLowerCase() === traderAddress.toLowerCase();
}

function normalizeBoundReferrer(
  boundReferrer: string | null | undefined
): string | null {
  if (!boundReferrer || boundReferrer === ZERO_EVM) return null;
  if (isSolanaChainFamily) {
    try {
      const pk = new PublicKey(boundReferrer);
      if (pk.equals(PublicKey.default)) return null;
      return pk.toBase58();
    } catch {
      return null;
    }
  }
  return boundReferrer.toLowerCase();
}

/**
 * Referrer wallet for trades.
 * - Solana: bound referrer must be passed on every trade for lifetime fee accrual.
 * - EVM: bound referrer is optional (contract reads storage) but harmless on buyWithReferrer.
 * - Stored ?ref= applies only before an on-chain bind exists.
 */
export function resolveTradeReferrer(params: {
  storedReferrer: string | null;
  boundReferrer: string | null | undefined;
  hasTraded: boolean | undefined;
  traderAddress: string | undefined;
}): string | null {
  const { storedReferrer, boundReferrer, hasTraded, traderAddress } = params;
  if (!traderAddress) return null;

  const bound = normalizeBoundReferrer(boundReferrer);
  if (bound && !isSelfReferral(bound, traderAddress)) {
    return bound;
  }

  if (hasTraded) return null;
  if (!storedReferrer) return null;
  if (isSelfReferral(storedReferrer, traderAddress)) return null;
  if (isSolanaChainFamily) return storedReferrer;
  return storedReferrer.toLowerCase();
}

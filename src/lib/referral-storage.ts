import { isAddress } from "viem";

export const REFERRAL_STORAGE_KEY = "pump-referral-ref";
export const REFERRAL_DISMISS_STORAGE_KEY = "pump-referral-banner-dismissed";

export function normalizeReferrer(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
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
    sessionStorage.removeItem(REFERRAL_DISMISS_STORAGE_KEY);
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

/** Referrer to pass on the next trade (first trade only, not yet bound on-chain). */
export function resolveTradeReferrer(params: {
  storedReferrer: string | null;
  boundReferrer: string | null | undefined;
  hasTraded: boolean | undefined;
  traderAddress: string | undefined;
}): `0x${string}` | null {
  const { storedReferrer, boundReferrer, hasTraded, traderAddress } = params;
  if (!traderAddress || hasTraded) return null;

  const bound =
    boundReferrer && boundReferrer !== "0x0000000000000000000000000000000000000000"
      ? boundReferrer.toLowerCase()
      : null;
  if (bound) return null;

  if (!storedReferrer || storedReferrer === traderAddress.toLowerCase()) return null;
  return storedReferrer as `0x${string}`;
}

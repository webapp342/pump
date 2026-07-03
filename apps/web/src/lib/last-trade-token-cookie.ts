/** Edge/middleware-safe cookie parsing — no viem or window. */
export const LAST_TRADE_TOKEN_COOKIE_NAME = "pump-last-trade-token";

const ADDRESS_RE = /^0x[a-f0-9]{40}$/;

export function parseLastTradeTokenCookie(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  try {
    const decoded = decodeURIComponent(value.trim()).toLowerCase();
    if (!ADDRESS_RE.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function buildLastTradeTokenHref(address: string): string {
  return `/token/${address}?trade=buy`;
}

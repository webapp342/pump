import { addressCacheKey } from "@/lib/address";
import { isSolanaChainFamily } from "@/config/chain-family";

/** Last connected wallet for portfolio SSR on repeat visits. */
export const PORTFOLIO_WALLET_COOKIE = "pump-portfolio-wallet";

/** 30 days — enough for return visits without permanent binding. */
export const PORTFOLIO_WALLET_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** Persist portfolio wallet cookie without corrupting base58 case. */
export function writePortfolioWalletCookie(address: string): void {
  if (typeof document === "undefined") return;
  const normalized = isSolanaChainFamily
    ? (addressCacheKey(address) ?? address.trim())
    : address.trim().toLowerCase();
  if (!normalized) return;
  document.cookie = `${PORTFOLIO_WALLET_COOKIE}=${encodeURIComponent(normalized)}; path=/; max-age=${PORTFOLIO_WALLET_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

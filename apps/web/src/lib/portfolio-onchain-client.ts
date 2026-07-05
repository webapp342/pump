import { PORTFOLIO_ONCHAIN_BALANCE_CHUNK } from "@/lib/portfolio-limits";

/** Client-side batched ERC20 balanceOf via /api/portfolio/onchain-balances. */
export async function fetchOnChainBalancesForTokens(
  walletAddress: string,
  tokenAddresses: string[]
): Promise<Record<string, string>> {
  if (tokenAddresses.length === 0) return {};

  const merged: Record<string, string> = {};

  for (let i = 0; i < tokenAddresses.length; i += PORTFOLIO_ONCHAIN_BALANCE_CHUNK) {
    const chunk = tokenAddresses.slice(i, i + PORTFOLIO_ONCHAIN_BALANCE_CHUNK);
    try {
      const response = await fetch("/api/portfolio/onchain-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, tokens: chunk }),
        cache: "no-store",
      });
      if (!response.ok) continue;
      const body = (await response.json()) as { data?: Record<string, string> };
      Object.assign(merged, body.data ?? {});
    } catch {
      // Keep partial results when a batch fails.
    }
  }

  return merged;
}

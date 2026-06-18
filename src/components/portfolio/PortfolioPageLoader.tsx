import { cookies } from "next/headers";
import { connection } from "next/server";
import { PortfolioPanel } from "@/components/portfolio/PortfolioPanel";
import { normalizeAddressParam } from "@/lib/address";
import { fetchPortfolioPayload } from "@/lib/portfolio-server";
import { PORTFOLIO_WALLET_COOKIE } from "@/lib/portfolio-wallet-cookie";

type PortfolioPageLoaderProps = {
  searchParams: Promise<{ address?: string }>;
};

/** Dynamic server island — portfolio SSR from cookie or ?address=. */
export async function PortfolioPageLoader({ searchParams }: PortfolioPageLoaderProps) {
  await connection();

  const { address: queryAddress } = await searchParams;
  const cookieStore = await cookies();
  const cookieAddress = cookieStore.get(PORTFOLIO_WALLET_COOKIE)?.value ?? null;
  const walletAddress = normalizeAddressParam(queryAddress ?? cookieAddress);

  let initialPortfolio = null;
  if (walletAddress) {
    try {
      initialPortfolio = await fetchPortfolioPayload(walletAddress);
    } catch {
      // Client retries after wallet connect if SSR fetch fails.
    }
  }

  return (
    <PortfolioPanel
      initialPortfolio={initialPortfolio}
      ssrWalletAddress={walletAddress}
    />
  );
}

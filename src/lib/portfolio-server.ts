import { cacheLife, cacheTag } from "next/cache";
import {
  getPortfolioForAddress,
  type PortfolioSnapshot,
} from "@/lib/db/launchpad";
import { PORTFOLIO_LAUNCHED_INITIAL } from "@/lib/portfolio-limits";

export type PortfolioPagePayload = PortfolioSnapshot;

function portfolioCacheTag(address: string): string {
  return `portfolio:${address.toLowerCase()}`;
}

/** Server-side portfolio snapshot — SSR /portfolio + shared cache layer. */
export async function fetchPortfolioPayload(
  address: string
): Promise<PortfolioPagePayload> {
  "use cache";
  cacheTag(portfolioCacheTag(address));
  cacheLife({ stale: 5, revalidate: 5, expire: 30 });

  return getPortfolioForAddress(address, {
    createdLimit: PORTFOLIO_LAUNCHED_INITIAL,
  });
}

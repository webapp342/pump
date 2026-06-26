import type { TokenListItem } from "@/lib/db/launchpad";
import { bnbToUsd } from "@/lib/format-usd";

/** Portfolio + arena board — single USD metric derivation from TokenListItem. */
export function tokenBoardMetricsUsd(
  token: TokenListItem,
  bnbUsd: number | null | undefined
) {
  return {
    mcapUsd: bnbToUsd(Number(token.marketCapBnb), bnbUsd),
    athUsd: bnbToUsd(
      Number(token.athMarketCapBnb ?? token.marketCapBnb),
      bnbUsd
    ),
    vol24hUsd: bnbToUsd(Number(token.volume24hBnb ?? 0), bnbUsd),
  };
}

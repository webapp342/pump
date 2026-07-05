"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEther, type Address } from "viem";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useScwBalance } from "@/hooks/useScwBalance";
import { usePortfolioQuery } from "@/hooks/usePortfolioQuery";
import { bnbToUsd } from "@/lib/format-usd";
import { sumVerifiedHoldingsBnb } from "@/lib/onchain-balance";
import { PORTFOLIO_LAUNCHED_INITIAL } from "@/lib/portfolio-limits";
import { fetchOnChainBalancesForTokens } from "@/lib/portfolio-onchain-client";
import {
  getCachedWalletTotal,
  publishWalletTotal,
  subscribeWalletTotal,
  type WalletTotalSnapshot,
} from "@/lib/wallet-total-balance";

function onChainBalancesQueryKey(walletAddress: string, tokenAddresses: string[]) {
  return ["portfolio-onchain-balances", walletAddress, tokenAddresses.join(",")] as const;
}

export function useWalletTotalBalance(address?: Address) {
  const normalized = address?.toLowerCase() ?? "";
  const { bnbUsd } = useBnbUsdPrice();
  const { data: balance } = useScwBalance(address);
  const [published, setPublished] = useState<WalletTotalSnapshot | null>(() =>
    normalized ? getCachedWalletTotal(normalized) : null
  );

  const portfolioQuery = usePortfolioQuery(normalized, PORTFOLIO_LAUNCHED_INITIAL, {
    enabled: Boolean(normalized),
  });

  const positions = portfolioQuery.data?.positions ?? [];
  const tokenAddresses = useMemo(
    () => positions.map((position) => position.tokenAddress),
    [positions]
  );

  const onChainQuery = useQuery({
    queryKey: onChainBalancesQueryKey(normalized, tokenAddresses),
    queryFn: () => fetchOnChainBalancesForTokens(normalized, tokenAddresses),
    enabled: Boolean(normalized) && tokenAddresses.length > 0,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!normalized) {
      setPublished(null);
      return;
    }
    setPublished(getCachedWalletTotal(normalized));
    return subscribeWalletTotal((snapshot) => {
      if (snapshot.address.toLowerCase() === normalized) {
        setPublished(snapshot);
      }
    });
  }, [normalized]);

  const nativeBnb = balance ? Number(formatEther(balance.value)) : 0;
  const nativeUsd = bnbToUsd(nativeBnb, bnbUsd) ?? 0;

  const verifiedHoldingsBnb = useMemo(() => {
    if (!positions.length) return 0;
    if (!onChainQuery.data) return null;
    return sumVerifiedHoldingsBnb(positions, onChainQuery.data);
  }, [positions, onChainQuery.data]);

  const verifiedHoldingsUsd =
    verifiedHoldingsBnb != null ? (bnbToUsd(verifiedHoldingsBnb, bnbUsd) ?? 0) : null;

  const holdingsUsd =
    published?.address.toLowerCase() === normalized
      ? published.holdingsUsd
      : (verifiedHoldingsUsd ?? 0);

  const totalUsd = holdingsUsd + nativeUsd;

  useEffect(() => {
    if (!normalized || verifiedHoldingsBnb == null) return;
    if (published?.address.toLowerCase() === normalized) return;

    publishWalletTotal({
      address: normalized,
      holdingsUsd: verifiedHoldingsUsd ?? 0,
      nativeBnb,
      nativeUsd,
      totalUsd: (verifiedHoldingsUsd ?? 0) + nativeUsd,
    });
  }, [normalized, verifiedHoldingsBnb, verifiedHoldingsUsd, nativeBnb, nativeUsd, published]);

  return {
    nativeBnb,
    nativeUsd,
    holdingsUsd,
    totalUsd,
    isPortfolioEnriched:
      published?.address.toLowerCase() === normalized || verifiedHoldingsBnb != null,
  };
}

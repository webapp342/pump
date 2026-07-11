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

  const indexedHoldingsBnb = useMemo(() => {
    if (!positions.length) return 0;
    return positions.reduce((sum, position) => {
      const balance = Number(position.tokenBalance);
      const price = Number(position.lastPriceBnb);
      if (!Number.isFinite(balance) || !Number.isFinite(price)) return sum;
      return sum + balance * price;
    }, 0);
  }, [positions]);

  const verifiedHoldingsBnb = useMemo(() => {
    if (!positions.length) return 0;
    if (!onChainQuery.data) return null;
    return sumVerifiedHoldingsBnb(positions, onChainQuery.data);
  }, [positions, onChainQuery.data]);

  const holdingsBnb = verifiedHoldingsBnb ?? indexedHoldingsBnb;
  const holdingsUsd = bnbToUsd(holdingsBnb, bnbUsd) ?? 0;

  const publishedHoldingsUsd =
    published?.address.toLowerCase() === normalized ? published.holdingsUsd : null;

  const resolvedHoldingsUsd = publishedHoldingsUsd ?? holdingsUsd;
  const totalUsd = resolvedHoldingsUsd + nativeUsd;

  useEffect(() => {
    if (!normalized || verifiedHoldingsBnb == null) return;
    if (published?.address.toLowerCase() === normalized) return;

    publishWalletTotal({
      address: normalized,
      holdingsUsd,
      nativeBnb,
      nativeUsd,
      totalUsd: holdingsUsd + nativeUsd,
    });
  }, [normalized, verifiedHoldingsBnb, holdingsUsd, nativeBnb, nativeUsd, published]);

  return {
    nativeBnb,
    nativeUsd,
    holdingsUsd: resolvedHoldingsUsd,
    totalUsd,
    isPortfolioEnriched:
      published?.address.toLowerCase() === normalized || verifiedHoldingsBnb != null,
  };
}

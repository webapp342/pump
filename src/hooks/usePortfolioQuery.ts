"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PortfolioSnapshot } from "@/lib/db/launchpad";
import { PORTFOLIO_LAUNCHED_INITIAL } from "@/lib/portfolio-limits";

async function fetchPortfolioSnapshot(
  walletAddress: string,
  createdLimit: number
): Promise<PortfolioSnapshot> {
  const response = await fetch(
    `/api/portfolio?address=${encodeURIComponent(walletAddress)}&createdLimit=${createdLimit}`,
    { cache: "no-store" }
  );
  const body = (await response.json()) as { data?: PortfolioSnapshot; error?: string };
  if (!response.ok || !body.data) {
    throw new Error(body.error ?? "Failed to load portfolio");
  }
  return body.data;
}

export function portfolioQueryKey(walletAddress: string, createdLimit: number) {
  return ["portfolio", walletAddress.toLowerCase(), createdLimit] as const;
}

export function usePortfolioQuery(
  walletAddress: string | null | undefined,
  createdLimit = PORTFOLIO_LAUNCHED_INITIAL,
  options?: { enabled?: boolean; initialData?: PortfolioSnapshot | null }
) {
  const normalized = walletAddress?.toLowerCase() ?? "";

  return useQuery({
    queryKey: portfolioQueryKey(normalized, createdLimit),
    queryFn: () => fetchPortfolioSnapshot(normalized, createdLimit),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    enabled: (options?.enabled ?? true) && Boolean(normalized),
    initialData: options?.initialData ?? undefined,
  });
}

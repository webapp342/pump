"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

type NativePriceResponse = {
  bnbUsd: number | null;
  nativeUsd?: number | null;
  source: string;
  pair: string;
};

async function fetchNativeUsdPrice(): Promise<number | null> {
  const res = await fetch("/api/bnb-price", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as NativePriceResponse;
  const price = json.nativeUsd ?? json.bnbUsd;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
}

/** Native/USD (BNB or ETH per chain) — 2s refresh for live USD chart + header. */
export function useBnbUsdPrice() {
  const query = useQuery({
    queryKey: ["native-usd-price"],
    queryFn: fetchNativeUsdPrice,
    staleTime: 2_000,
    refetchInterval: 2_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  return {
    bnbUsd: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

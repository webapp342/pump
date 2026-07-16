"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

type NativePriceResponse = {
  /** @deprecated legacy key — same as nativeUsd */
  bnbUsd: number | null;
  nativeUsd?: number | null;
  source: string;
  pair: string;
  symbol?: string;
};

async function fetchNativeUsdPriceClient(): Promise<number | null> {
  const res = await fetch("/api/bnb-price", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as NativePriceResponse;
  const price = json.nativeUsd ?? json.bnbUsd;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Chain-native / USD (ETHUSDT on Base, BNBUSDT only if still on BSC).
 * Prefer this name over the legacy `useBnbUsdPrice` alias.
 */
export function useNativeUsdPrice() {
  const query = useQuery({
    queryKey: ["native-usd-price"],
    queryFn: fetchNativeUsdPriceClient,
    staleTime: 2_000,
    refetchInterval: 2_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  const nativeUsd = query.data ?? null;

  return {
    nativeUsd,
    /** @deprecated use `nativeUsd` — kept for existing call sites */
    bnbUsd: nativeUsd,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** @deprecated use `useNativeUsdPrice` */
export function useBnbUsdPrice() {
  return useNativeUsdPrice();
}

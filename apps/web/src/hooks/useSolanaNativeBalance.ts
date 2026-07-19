"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { addressCacheKey } from "@/lib/address";
import { getSolanaConnection } from "@/lib/solana/transfer";

const POLL_MS = 4_000;

export function useSolanaNativeBalance(address?: string) {
  const normalized = addressCacheKey(address) ?? undefined;

  return useQuery({
    queryKey: ["solana-native-balance", normalized],
    queryFn: async () => {
      const conn = getSolanaConnection();
      return BigInt(await conn.getBalance(new PublicKey(normalized!), "confirmed"));
    },
    enabled: Boolean(normalized),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
  });
}

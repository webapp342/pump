"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { getSolanaConnection } from "@/lib/solana/transfer";

const POLL_MS = 4_000;

export function useSolanaNativeBalance(address?: string) {
  return useQuery({
    queryKey: ["solana-native-balance", address],
    queryFn: async () => {
      const conn = getSolanaConnection();
      return BigInt(await conn.getBalance(new PublicKey(address!), "confirmed"));
    },
    enabled: Boolean(address),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
}

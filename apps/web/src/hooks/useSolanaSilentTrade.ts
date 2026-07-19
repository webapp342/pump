"use client";

/**
 * Popup-free Solana buy/sell — same UX intent as Kernel UserOps on EVM.
 */

import { useCallback, useState } from "react";
import { hydrateSolanaSilentSession } from "@/lib/solana/silent-session";
import { silentBuy, silentSell } from "@/lib/solana/silent-trade";

export function useSolanaSilentTrade() {
  const [pending, setPending] = useState(false);

  const ensureReady = useCallback(async () => {
    return hydrateSolanaSilentSession();
  }, []);

  const buy = useCallback(
    async (input: {
      mintAddress: string;
      solInLamports: bigint;
      minTokenOut: bigint;
    }) => {
      setPending(true);
      try {
        await ensureReady();
        return await silentBuy(input);
      } finally {
        setPending(false);
      }
    },
    [ensureReady]
  );

  const sell = useCallback(
    async (input: {
      mintAddress: string;
      tokenIn: bigint;
      minSolOut: bigint;
    }) => {
      setPending(true);
      try {
        await ensureReady();
        return await silentSell(input);
      } finally {
        setPending(false);
      }
    },
    [ensureReady]
  );

  return { buy, sell, pending, ensureReady };
}

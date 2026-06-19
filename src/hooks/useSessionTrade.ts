"use client";

import { useCallback, useState } from "react";
import { encodeFunctionData, type Address, type Hash } from "viem";
import { contracts, pumpChain } from "@/config/chain";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";

export type SessionBuyParams = {
  tokenAddress: Address;
  minTokenOut: bigint;
  value: bigint;
  referrer?: Address;
};

export function useSessionTrade() {
  const { sessionClient, hasValidSession, requestSessionGrant, withdraw } = usePumpWallet();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeBuy = useCallback(
    async (params: SessionBuyParams): Promise<Hash> => {
      if (!sessionClient) {
        requestSessionGrant();
        throw new Error("Session grant required.");
      }

      setIsPending(true);
      setError(null);
      try {
        const data = encodeFunctionData({
          abi: bondingCurveManagerAbi,
          functionName: params.referrer ? "buyWithReferrer" : "buy",
          args: params.referrer
            ? [params.tokenAddress, params.minTokenOut, params.referrer]
            : [params.tokenAddress, params.minTokenOut],
        });

        if (!sessionClient.account) {
          throw new Error("Smart account not ready.");
        }

        const hash = await sessionClient.sendTransaction({
          account: sessionClient.account,
          chain: pumpChain,
          to: contracts.bondingCurveManager,
          data,
          value: params.value,
        } as Parameters<typeof sessionClient.sendTransaction>[0]);
        return hash;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Trade failed.";
        setError(message);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [sessionClient, requestSessionGrant]
  );

  return {
    executeBuy,
    withdraw,
    isPending,
    error,
    hasValidSession,
    requestSessionGrant,
  };
}

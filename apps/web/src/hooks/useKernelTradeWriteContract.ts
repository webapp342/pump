"use client";

import { useCallback, useState } from "react";
import type { Abi, Address, Hash, TransactionReceipt } from "viem";
import { encodeFunctionData } from "viem";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { isTradeFlashblocksActive } from "@/config/flashblocks";
import { tradeBundlerLog } from "@/lib/aa/bundler-debug";
import { resolveTradeKernelClients } from "@/lib/aa/kernel-trade-clients";
import {
  sendKernelTransaction,
  type KernelTransactionResult,
} from "@/lib/aa/send-kernel-transaction";
import { failTradeTrace, tradeTraceStep } from "@/lib/trade-timing";

export type KernelTradeWriteParams = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  chainId?: number;
};

/**
 * Buy/sell only — trade HTTPS RPC for UserOp prepare + WSS Flashblocks confirm.
 * Returns receipt in the same tick as txHash (no second wagmi waiter).
 */
export function useKernelTradeWriteContract() {
  const { kernelClient } = usePumpWallet();
  const [txHash, setTxHash] = useState<Hash | undefined>();
  const [receipt, setReceipt] = useState<TransactionReceipt | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setTxHash(undefined);
    setReceipt(undefined);
    setError(null);
    setIsPending(false);
  }, []);

  const tradeWrite = useCallback(
    (params: KernelTradeWriteParams) => {
      if (!kernelClient) {
        setError(new Error("Sign in to trade."));
        failTradeTrace("ux.kernel_client_missing", new Error("Sign in to trade."));
        return;
      }

      setIsPending(true);
      setError(null);
      setReceipt(undefined);
      tradeTraceStep("ux.isPending=true");

      void (async () => {
        const t0 = performance.now();
        try {
          if (!kernelClient.account) {
            throw new Error("Smart account not ready.");
          }

          const flashblocks = isTradeFlashblocksActive();
          tradeTraceStep("kernel.resolve_clients.start", { flashblocks });
          const { kernelClient: activeClient, publicClient } = resolveTradeKernelClients(
            kernelClient,
            flashblocks
          );
          tradeTraceStep("kernel.resolve_clients.done", {
            scw: activeClient.account!.address,
            flashblocks,
          });

          tradeBundlerLog("tradeWrite start", {
            scw: activeClient.account!.address,
            to: params.address,
            fn: params.functionName,
            flashblocks,
          });

          tradeTraceStep("chain.trade_write.invoke", {
            to: params.address,
            fn: params.functionName,
            value: params.value?.toString() ?? "0",
          });

          const result: KernelTransactionResult = await sendKernelTransaction(
            activeClient,
            publicClient,
            {
              to: params.address,
              data: encodeFunctionData({
                abi: params.abi,
                functionName: params.functionName,
                args: params.args,
              }),
              value: params.value ?? 0n,
            },
            { flashblocks }
          );

          tradeTraceStep("chain.trade_write.returned", {
            txHash: result.hash,
            hasReceipt: Boolean(result.receipt),
            ms: Math.round(performance.now() - t0),
          });

          tradeBundlerLog("tradeWrite done", {
            txHash: result.hash,
            hasReceipt: Boolean(result.receipt),
            ms: Math.round(performance.now() - t0),
          });

          setTxHash(result.hash);
          tradeTraceStep("ux.txHash_set", { txHash: result.hash });
          if (result.receipt) {
            setReceipt(result.receipt);
            tradeTraceStep("ux.kernel_receipt_set", {
              blockNumber: result.receipt.blockNumber.toString(),
            });
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          tradeBundlerLog("tradeWrite failed", {
            message: error.message,
            ms: Math.round(performance.now() - t0),
          });
          failTradeTrace("chain.trade_write.failed", error);
          setError(error);
        } finally {
          setIsPending(false);
          tradeTraceStep("ux.isPending=false");
        }
      })();
    },
    [kernelClient]
  );

  return { tradeWrite, txHash, receipt, isPending, reset, error };
}

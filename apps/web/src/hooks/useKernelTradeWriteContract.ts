"use client";

import { useCallback, useRef, useState } from "react";
import type { Abi, Address, Hash, TransactionReceipt } from "viem";
import { encodeFunctionData } from "viem";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { isTradeFlashblocksActive } from "@/config/flashblocks";
import { tradeBundlerLog } from "@/lib/aa/bundler-debug";
import { resolveTradeKernelClients } from "@/lib/aa/kernel-trade-clients";
import {
  confirmKernelUserOperation,
  submitKernelUserOperation,
  type KernelTransactionResult,
} from "@/lib/aa/send-kernel-transaction";
import { failTradeTrace, tradeTraceStep } from "@/lib/trade-timing";

export type KernelTradeWriteCallbacks = {
  onSubmitted?: (payload: { userOpHash: Hash }) => void;
  onIncluded?: (txHash: Hash) => void;
  onConfirmed?: (result: KernelTransactionResult) => void;
  onFailed?: (error: Error) => void;
};

export type KernelTradeWriteParams = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  chainId?: number;
  callbacks?: KernelTradeWriteCallbacks;
  /** SCW balance check — parallel with send_user_op, not before it. */
  preflight?: () => Promise<void>;
};

export type TradeWritePhase =
  | "idle"
  | "preparing"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "failed";

/**
 * Buy/sell only — unlock UI at `submitted`; confirm runs in background (pump.fun style).
 */
export function useKernelTradeWriteContract() {
  const { kernelClient } = usePumpWallet();
  const [txHash, setTxHash] = useState<Hash | undefined>();
  const [userOpHash, setUserOpHash] = useState<Hash | undefined>();
  const [receipt, setReceipt] = useState<TransactionReceipt | undefined>();
  const [tradePhase, setTradePhase] = useState<TradeWritePhase>("idle");
  const [error, setError] = useState<Error | null>(null);
  const writeGenerationRef = useRef(0);

  const isSubmitting = tradePhase === "preparing";
  const isBackgroundConfirming =
    tradePhase === "submitted" || tradePhase === "confirming";

  const reset = useCallback(() => {
    setTxHash(undefined);
    setUserOpHash(undefined);
    setReceipt(undefined);
    setError(null);
    setTradePhase("idle");
  }, []);

  const tradeWrite = useCallback(
    (params: KernelTradeWriteParams) => {
      if (!kernelClient) {
        const err = new Error("Sign in to trade.");
        setError(err);
        params.callbacks?.onFailed?.(err);
        failTradeTrace("ux.kernel_client_missing", err);
        return;
      }

      const generation = ++writeGenerationRef.current;
      const isCurrent = () => writeGenerationRef.current === generation;

      setTradePhase("preparing");
      setError(null);
      setReceipt(undefined);
      setUserOpHash(undefined);
      setTxHash(undefined);
      tradeTraceStep("ux.isSubmitting=true");
      tradeTraceStep("ux.trade_phase", { phase: "preparing" });

      void (async () => {
        const t0 = performance.now();
        const { callbacks } = params;
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

          const call = {
            to: params.address,
            data: encodeFunctionData({
              abi: params.abi,
              functionName: params.functionName,
              args: params.args,
            }),
            value: params.value ?? 0n,
          };

          const submitResult = await submitKernelUserOperation(
            activeClient,
            publicClient,
            call,
            { preflight: params.preflight }
          );

          if (isCurrent()) {
            setUserOpHash(submitResult.userOpHash);
            setTradePhase("submitted");
            tradeTraceStep("ux.trade_phase", {
              phase: "submitted",
              userOpHash: submitResult.userOpHash,
            });
            tradeTraceStep("ux.isSubmitting=false");
          }
          tradeTraceStep("ux.user_op_submitted", { userOpHash: submitResult.userOpHash });
          tradeTraceStep("ux.button_unlock", { userOpHash: submitResult.userOpHash });
          callbacks?.onSubmitted?.({ userOpHash: submitResult.userOpHash });

          if (isCurrent()) {
            setTradePhase("confirming");
            tradeTraceStep("ux.trade_phase", { phase: "confirming" });
          }

          const result: KernelTransactionResult = await confirmKernelUserOperation(
            activeClient,
            publicClient,
            submitResult.userOpHash,
            submitResult.fromBlock,
            {
              flashblocks,
              onIncluded: (includedTxHash) => {
                if (isCurrent()) {
                  setTxHash(includedTxHash);
                  tradeTraceStep("ux.txHash_early", { txHash: includedTxHash });
                }
                callbacks?.onIncluded?.(includedTxHash);
              },
            }
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

          if (isCurrent()) {
            setTxHash(result.hash);
            tradeTraceStep("ux.txHash_set", { txHash: result.hash });
            if (result.receipt) {
              setReceipt(result.receipt);
              tradeTraceStep("ux.kernel_receipt_set", {
                blockNumber: result.receipt.blockNumber.toString(),
              });
            }
            setTradePhase("confirmed");
            tradeTraceStep("ux.trade_phase", { phase: "confirmed", txHash: result.hash });
          }
          callbacks?.onConfirmed?.(result);
        } catch (err) {
          const caught = err instanceof Error ? err : new Error(String(err));
          tradeBundlerLog("tradeWrite failed", {
            message: caught.message,
            ms: Math.round(performance.now() - t0),
          });
          failTradeTrace("chain.trade_write.failed", caught);
          if (isCurrent()) {
            setError(caught);
            setTradePhase("failed");
            tradeTraceStep("ux.trade_phase", { phase: "failed", message: caught.message });
          }
          callbacks?.onFailed?.(caught);
        }
      })();
    },
    [kernelClient]
  );

  return {
    tradeWrite,
    txHash,
    userOpHash,
    receipt,
    tradePhase,
    isSubmitting,
    isBackgroundConfirming,
    /** @deprecated Prefer isSubmitting — only blocks during prepare. */
    isPending: isSubmitting,
    reset,
    error,
  };
}

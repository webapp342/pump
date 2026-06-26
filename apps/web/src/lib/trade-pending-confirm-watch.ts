import type { KernelAccountClient } from "@zerodev/sdk";
import { getUserOperationReceipt } from "viem/account-abstraction";
import { getAction } from "viem/utils";
import type { Hash, PublicClient, TransactionReceipt } from "viem";
import { createTradeHttpPublicClient, isTradeFlashblocksActive } from "@/config/flashblocks";
import { resolveTradeKernelClients } from "@/lib/aa/kernel-trade-clients";
import type { KernelTransactionResult } from "@/lib/aa/send-kernel-transaction";
import { isTradeOrderActive } from "@/lib/trade-order-toast";
import { tradeTraceStep } from "@/lib/trade-timing";

const POLL_MS = 2_000;
const TIMEOUT_MS = 180_000;

type WatchCallbacks = {
  onConfirmed: (result: KernelTransactionResult) => void;
  onFailed: (error: Error) => void;
};

const activeWatchers = new Map<string, ReturnType<typeof setInterval>>();

function clearWatcher(pendingId: string): void {
  const timer = activeWatchers.get(pendingId);
  if (timer != null) {
    clearInterval(timer);
    activeWatchers.delete(pendingId);
  }
}

async function fetchChainReceipt(txHash: Hash): Promise<TransactionReceipt | undefined> {
  const client = createTradeHttpPublicClient();
  try {
    return await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return undefined;
  }
}

async function pollPendingConfirmation(
  kernelClient: KernelAccountClient,
  pendingId: string,
  userOpHash: Hash,
  callbacks: WatchCallbacks,
  startedAt: number
): Promise<void> {
  if (!isTradeOrderActive(pendingId)) {
    clearWatcher(pendingId);
    return;
  }
  if (Date.now() - startedAt > TIMEOUT_MS) {
    clearWatcher(pendingId);
    callbacks.onFailed(new Error("Timed out waiting for on-chain confirmation."));
    return;
  }

  const flashblocks = isTradeFlashblocksActive();
  const { kernelClient: activeClient, publicClient } = resolveTradeKernelClients(
    kernelClient,
    flashblocks
  );

  try {
    const opReceipt = await getAction(
      activeClient,
      getUserOperationReceipt,
      "getUserOperationReceipt"
    )({ hash: userOpHash });

    if (!opReceipt?.receipt.transactionHash) return;

    if (!opReceipt.success) {
      clearWatcher(pendingId);
      callbacks.onFailed(
        new Error(
          opReceipt.reason
            ? `UserOperation failed: ${opReceipt.reason}`
            : `UserOperation failed (${userOpHash})`
        )
      );
      return;
    }

    const txHash = opReceipt.receipt.transactionHash;
    const receipt =
      (await fetchChainReceipt(txHash)) ??
      (await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => undefined));

    clearWatcher(pendingId);
    tradeTraceStep("ux.pending_watch.confirmed", { pendingId, userOpHash, txHash });
    callbacks.onConfirmed({ hash: txHash, receipt });
  } catch {
    /* Still pending on bundler. */
  }
}

export function startPendingTradeConfirmationWatch(
  kernelClient: KernelAccountClient,
  pendingId: string,
  userOpHash: Hash,
  callbacks: WatchCallbacks
): void {
  clearWatcher(pendingId);
  const startedAt = Date.now();
  void pollPendingConfirmation(kernelClient, pendingId, userOpHash, callbacks, startedAt);
  const timer = setInterval(() => {
    void pollPendingConfirmation(kernelClient, pendingId, userOpHash, callbacks, startedAt);
  }, POLL_MS);
  activeWatchers.set(pendingId, timer);
}

export function stopPendingTradeConfirmationWatch(pendingId: string): void {
  clearWatcher(pendingId);
}

export async function trySettleFromTxReceipt(
  pendingId: string,
  txHash: Hash,
  receipt: TransactionReceipt,
  callbacks: WatchCallbacks
): Promise<boolean> {
  if (!isTradeOrderActive(pendingId)) return false;
  clearWatcher(pendingId);
  tradeTraceStep("ux.pending_watch.receipt_fallback", { pendingId, txHash });
  callbacks.onConfirmed({ hash: txHash, receipt });
  return true;
}

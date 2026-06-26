import type { KernelAccountClient } from "@zerodev/sdk";
import { getUserOperationReceipt, waitForUserOperationReceipt } from "viem/account-abstraction";
import { getAction } from "viem/utils";
import type { Hash, PublicClient, TransactionReceipt } from "viem";
import { bundlerDebug, tradeBundlerLog } from "@/lib/aa/bundler-debug";
import { tradeTraceStep } from "@/lib/trade-timing";
import {
  createTradeHttpPublicClient,
  createTradeWebSocketPublicClient,
  FLASHBLOCKS_INCLUSION_POLL_MS,
  FLASHBLOCKS_POLL_MS,
  isTradeFlashblocksActive,
  waitForFlashblocksTransactionReceipt,
} from "@/config/flashblocks";

const CONFIRM_TIMEOUT_MS = 180_000;
const LEGACY_POLL_MS = 2_000;

export type UserOpConfirmationOptions = {
  /** Base Flashblocks fast path — trade buy/sell only. */
  flashblocks?: boolean;
  /** Fires when bundler reports inclusion — before Flashblocks receipt fetch. */
  onIncluded?: (txHash: Hash) => void;
};

export type UserOpConfirmationResult = {
  txHash: Hash;
  receipt?: TransactionReceipt;
  confirmPath: string;
};

function fastConfirmEnabled(options?: UserOpConfirmationOptions): boolean {
  return Boolean(options?.flashblocks && isTradeFlashblocksActive());
}

function pollIntervalMs(options?: UserOpConfirmationOptions): number {
  return fastConfirmEnabled(options) ? FLASHBLOCKS_INCLUSION_POLL_MS : LEGACY_POLL_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFlashblocksReceipt(
  txHash: Hash,
  deadline: number,
  options?: UserOpConfirmationOptions
): Promise<TransactionReceipt | undefined> {
  if (!fastConfirmEnabled(options)) return undefined;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return undefined;

  const httpClient = createTradeHttpPublicClient();
  try {
    const instant = await httpClient.getTransactionReceipt({ hash: txHash });
    if (instant) {
      tradeTraceStep("flashblocks.receipt_http.instant", {
        txHash,
        blockNumber: instant.blockNumber.toString(),
      });
      return instant;
    }
  } catch {
    // not yet on RPC
  }

  const t0 = performance.now();
  tradeTraceStep("flashblocks.receipt_wait.start", { txHash });
  const receipt = await waitForFlashblocksTransactionReceipt(txHash, {
    timeout: Math.min(remaining, 15_000),
    client: createTradeWebSocketPublicClient(),
  });
  tradeTraceStep("flashblocks.receipt_wait.done", {
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    ms: Math.round(performance.now() - t0),
  });
  return receipt;
}

/** Flashblocks when enabled; otherwise chain RPC via the trade public client. */
async function resolveTransactionReceipt(
  publicClient: PublicClient,
  txHash: Hash,
  deadline: number,
  options?: UserOpConfirmationOptions
): Promise<TransactionReceipt | undefined> {
  const flashblocksReceipt = await fetchFlashblocksReceipt(txHash, deadline, options);
  if (flashblocksReceipt) return flashblocksReceipt;

  const remaining = deadline - Date.now();
  if (remaining <= 0) return undefined;

  try {
    const instant = await publicClient.getTransactionReceipt({ hash: txHash });
    if (instant) {
      tradeTraceStep("chain.receipt_http.instant", {
        txHash,
        blockNumber: instant.blockNumber.toString(),
      });
      return instant;
    }
  } catch {
    // not yet on RPC
  }

  tradeTraceStep("chain.receipt_wait.start", { txHash });
  return publicClient.waitForTransactionReceipt({
    hash: txHash,
    pollingInterval: LEGACY_POLL_MS,
    timeout: Math.min(remaining, CONFIRM_TIMEOUT_MS),
  });
}

/**
 * Flashblocks trade path: WSS newHeads + fast bundler poll until UserOp is included,
 * then single deduped receipt fetch (HTTP instant → WSS).
 */
async function waitViaFlashblocksTradeConfirm(
  client: KernelAccountClient,
  userOpHash: Hash,
  deadline: number,
  options?: UserOpConfirmationOptions
): Promise<UserOpConfirmationResult> {
  const wsClient = createTradeWebSocketPublicClient();
  let settled = false;
  let resolveInflight = false;
  let unwatch: (() => void) | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  tradeTraceStep("bundler.wait_inclusion.start", { userOpHash });

  const tryResolve = async (): Promise<UserOpConfirmationResult | null> => {
    if (settled) return null;

    const opReceipt = await getAction(
      client,
      getUserOperationReceipt,
      "getUserOperationReceipt"
    )({ hash: userOpHash });

    if (!opReceipt?.receipt.transactionHash) return null;

    if (!opReceipt.success) {
      throw new Error(
        opReceipt.reason
          ? `UserOperation failed: ${opReceipt.reason}`
          : `UserOperation failed (${userOpHash})`
      );
    }

    const txHash = opReceipt.receipt.transactionHash;
    tradeTraceStep("bundler.user_op_included", { userOpHash, txHash });
    options?.onIncluded?.(txHash);

    const fbReceipt = await fetchFlashblocksReceipt(txHash, deadline, options);
    if (!fbReceipt) {
      throw new Error(`Flashblocks receipt missing for ${txHash}`);
    }

    return { txHash, receipt: fbReceipt, confirmPath: "flashblocks-trade" };
  };

  return new Promise<UserOpConfirmationResult>((resolve, reject) => {
    const cleanup = () => {
      settled = true;
      unwatch?.();
      if (pollTimer) clearInterval(pollTimer);
    };

    const attempt = async () => {
      if (settled || resolveInflight) return;
      resolveInflight = true;
      try {
        const result = await tryResolve();
        if (!result) {
          resolveInflight = false;
          return;
        }
        cleanup();
        tradeBundlerLog("confirmed via Flashblocks trade", {
          userOpHash,
          txHash: result.txHash,
        });
        resolve(result);
      } catch (error) {
        resolveInflight = false;
        if (settled) return;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("UserOperation failed")) {
          cleanup();
          reject(error);
        }
      }
    };

    void attempt();
    pollTimer = setInterval(() => {
      void attempt();
    }, FLASHBLOCKS_INCLUSION_POLL_MS);

    try {
      unwatch = wsClient.watchBlocks({
        onBlock: () => {
          void attempt();
        },
        onError: (error) => {
          if (settled) return;
          cleanup();
          reject(error);
        },
      });
    } catch (error) {
      // HTTP-only fallback still polls via interval
      tradeBundlerLog("flashblocks wss watch failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const remaining = deadline - Date.now();
    setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(
        new Error(`Timed out waiting for Flashblocks UserOperation receipt (${userOpHash})`)
      );
    }, Math.max(remaining, 0));
  });
}

async function waitViaBundlerReceipt(
  client: KernelAccountClient,
  publicClient: PublicClient,
  userOpHash: Hash,
  deadline: number,
  options?: UserOpConfirmationOptions
): Promise<UserOpConfirmationResult> {
  const pollMs = pollIntervalMs(options);

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    try {
      const receipt = await getAction(
        client,
        waitForUserOperationReceipt,
        "waitForUserOperationReceipt"
      )({
        hash: userOpHash,
        pollingInterval: pollMs,
        timeout: Math.min(CONFIRM_TIMEOUT_MS, remaining),
      });

      bundlerDebug("info", "bundler receipt", userOpHash, {
        txHash: receipt.receipt.transactionHash,
        success: receipt.success,
      });

      if (!receipt.success) {
        throw new Error(
          receipt.reason
            ? `UserOperation failed: ${receipt.reason}`
            : `UserOperation failed (${userOpHash})`
        );
      }

      const txHash = receipt.receipt.transactionHash;
      tradeTraceStep("bundler.user_op_included", { userOpHash, txHash });
      options?.onIncluded?.(txHash);

      const chainReceipt = await resolveTransactionReceipt(
        publicClient,
        txHash,
        deadline,
        options
      );
      return { txHash, receipt: chainReceipt, confirmPath: "bundler-receipt" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      if (
        lower.includes("failed to get user operation receipt") ||
        lower.includes("user operation not found") ||
        lower.includes("timed out")
      ) {
        tradeBundlerLog("bundler receipt pending", { userOpHash, message });
        await sleep(pollMs);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Timed out waiting for bundler UserOperation receipt (${userOpHash})`);
}

/** Bundler receipt (legacy) or Flashblocks trade confirm. */
export async function waitForUserOpConfirmation(
  client: KernelAccountClient,
  publicClient: PublicClient,
  userOpHash: Hash,
  fromBlock: bigint,
  options?: UserOpConfirmationOptions
): Promise<UserOpConfirmationResult> {
  void fromBlock;

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  tradeBundlerLog("waiting confirmation", {
    userOpHash,
    timeoutMs: CONFIRM_TIMEOUT_MS,
    flashblocks: fastConfirmEnabled(options),
  });

  if (fastConfirmEnabled(options)) {
    return waitViaFlashblocksTradeConfirm(client, userOpHash, deadline, options);
  }

  return waitViaBundlerReceipt(client, publicClient, userOpHash, deadline, options);
}

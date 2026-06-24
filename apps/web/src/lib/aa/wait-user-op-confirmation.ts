import type { KernelAccountClient } from "@zerodev/sdk";
import {
  entryPoint07Abi,
  getUserOperationReceipt,
  waitForUserOperationReceipt,
} from "viem/account-abstraction";
import { getAction } from "viem/utils";
import type { Hash, PublicClient, TransactionReceipt } from "viem";
import { bundlerDebug, tradeBundlerLog } from "@/lib/aa/bundler-debug";
import { entryPoint } from "@/lib/aa/kernel-account";
import { tradeTraceStep } from "@/lib/trade-timing";
import {
  createTradeWebSocketPublicClient,
  FLASHBLOCKS_POLL_MS,
  isTradeFlashblocksActive,
  waitForFlashblocksTransactionReceipt,
} from "@/config/flashblocks";

const CONFIRM_TIMEOUT_MS = 180_000;
const LEGACY_POLL_MS = 2_000;

export type UserOpConfirmationOptions = {
  /** Base Flashblocks fast path — trade buy/sell only. */
  flashblocks?: boolean;
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
  return fastConfirmEnabled(options) ? FLASHBLOCKS_POLL_MS : LEGACY_POLL_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attachFlashblocksReceipt(
  txHash: Hash,
  deadline: number,
  options?: UserOpConfirmationOptions
): Promise<TransactionReceipt | undefined> {
  if (!fastConfirmEnabled(options)) return undefined;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return undefined;
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

async function getUserOpEventChunked(
  publicClient: PublicClient,
  userOpHash: Hash,
  fromBlock: bigint
) {
  const head = await publicClient.getBlockNumber();
  const maxSpan = 9n;
  let start = fromBlock > 5n ? fromBlock - 5n : fromBlock;

  while (start <= head) {
    const end = start + maxSpan > head ? head : start + maxSpan;
    const logs = await publicClient.getContractEvents({
      address: entryPoint.address,
      abi: entryPoint07Abi,
      eventName: "UserOperationEvent",
      args: { userOpHash },
      fromBlock: start,
      toBlock: end,
    });
    if (logs.length > 0) return logs[0];
    start = end + 1n;
  }

  return null;
}

async function waitViaEntryPointLogs(
  publicClient: PublicClient,
  userOpHash: Hash,
  fromBlock: bigint,
  deadline: number,
  options?: UserOpConfirmationOptions
): Promise<UserOpConfirmationResult> {
  const pollMs = pollIntervalMs(options);

  while (Date.now() < deadline) {
    try {
      const log = await getUserOpEventChunked(publicClient, userOpHash, fromBlock);

      if (log) {
        const txHash = log.transactionHash;
        tradeBundlerLog("confirmed via EntryPoint logs", {
          userOpHash,
          txHash,
          success: log.args.success,
        });
        if (!log.args.success) {
          throw new Error(`UserOperation reverted on-chain (${userOpHash})`);
        }
        const receipt = await attachFlashblocksReceipt(txHash, deadline, options);
        return { txHash, receipt, confirmPath: "entrypoint-logs" };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tradeBundlerLog("EntryPoint poll error", { userOpHash, message });
      if (message.includes("reverted on-chain")) {
        throw error;
      }
    }

    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for EntryPoint UserOperationEvent (${userOpHash})`);
}

async function waitViaBundlerReceipt(
  client: KernelAccountClient,
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
      const fbReceipt = await attachFlashblocksReceipt(txHash, deadline, options);
      return { txHash, receipt: fbReceipt, confirmPath: "bundler-receipt" };
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

async function waitViaFlashblocksBundlerPoll(
  client: KernelAccountClient,
  userOpHash: Hash,
  deadline: number
): Promise<UserOpConfirmationResult> {
  while (Date.now() < deadline) {
    try {
      const receipt = await getAction(
        client,
        getUserOperationReceipt,
        "getUserOperationReceipt"
      )({ hash: userOpHash });

      if (receipt?.receipt.transactionHash) {
        if (!receipt.success) {
          throw new Error(
            receipt.reason
              ? `UserOperation failed: ${receipt.reason}`
              : `UserOperation failed (${userOpHash})`
          );
        }

        const txHash = receipt.receipt.transactionHash;
        const fbReceipt = await attachFlashblocksReceipt(txHash, deadline, {
          flashblocks: true,
        });
        if (!fbReceipt) {
          throw new Error(`Flashblocks receipt missing for ${txHash}`);
        }

        tradeBundlerLog("confirmed via Flashblocks WSS", { userOpHash, txHash });
        return { txHash, receipt: fbReceipt, confirmPath: "flashblocks-bundler-poll" };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UserOperation failed")) {
        throw error;
      }
      tradeBundlerLog("flashblocks bundler poll pending", { userOpHash, message });
    }

    await sleep(FLASHBLOCKS_POLL_MS);
  }

  throw new Error(`Timed out waiting for Flashblocks UserOperation receipt (${userOpHash})`);
}

/** Bundler receipt OR EntryPoint logs OR Flashblocks poll — whichever confirms first. */
export async function waitForUserOpConfirmation(
  client: KernelAccountClient,
  publicClient: PublicClient,
  userOpHash: Hash,
  fromBlock: bigint,
  options?: UserOpConfirmationOptions
): Promise<UserOpConfirmationResult> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  tradeBundlerLog("waiting confirmation", {
    userOpHash,
    fromBlock: fromBlock.toString(),
    timeoutMs: CONFIRM_TIMEOUT_MS,
    flashblocks: fastConfirmEnabled(options),
  });

  const racers: Promise<UserOpConfirmationResult>[] = fastConfirmEnabled(options)
    ? [
        waitViaFlashblocksBundlerPoll(client, userOpHash, deadline),
        waitViaEntryPointLogs(publicClient, userOpHash, fromBlock, deadline, options),
      ]
    : [
        waitViaBundlerReceipt(client, userOpHash, deadline, options),
        waitViaEntryPointLogs(publicClient, userOpHash, fromBlock, deadline, options),
      ];

  try {
    return await Promise.any(racers);
  } catch (aggregate) {
    const errors =
      aggregate instanceof AggregateError
        ? aggregate.errors.map((e) => (e instanceof Error ? e.message : String(e)))
        : [aggregate instanceof Error ? aggregate.message : String(aggregate)];

    tradeBundlerLog("confirmation failed", { userOpHash, errors });
    throw new Error(
      `Timed out while waiting for User Operation ${userOpHash}. ${errors.join(" | ")}`
    );
  }
}

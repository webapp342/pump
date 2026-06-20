import type { KernelAccountClient } from "@zerodev/sdk";
import {
  entryPoint07Abi,
  waitForUserOperationReceipt,
} from "viem/account-abstraction";
import { getAction } from "viem/utils";
import type { Hash, PublicClient } from "viem";
import { bundlerDebug, tradeBundlerLog } from "@/lib/aa/bundler-debug";
import { entryPoint } from "@/lib/aa/kernel-account";

const CONFIRM_TIMEOUT_MS = 180_000;
const POLL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getUserOpEventChunked(
  publicClient: PublicClient,
  userOpHash: Hash,
  fromBlock: bigint
) {
  const head = await publicClient.getBlockNumber();
  const maxSpan = 9n; // Alchemy free tier: 10 blocks inclusive
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
  deadline: number
): Promise<Hash> {
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
        return txHash;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tradeBundlerLog("EntryPoint poll error", { userOpHash, message });
      if (message.includes("reverted on-chain")) {
        throw error;
      }
    }

    await sleep(POLL_MS);
  }

  throw new Error(`Timed out waiting for EntryPoint UserOperationEvent (${userOpHash})`);
}

async function waitViaBundlerReceipt(
  client: KernelAccountClient,
  userOpHash: Hash
): Promise<Hash> {
  const receipt = await getAction(
    client,
    waitForUserOperationReceipt,
    "waitForUserOperationReceipt"
  )({
    hash: userOpHash,
    pollingInterval: POLL_MS,
    timeout: CONFIRM_TIMEOUT_MS,
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

  return receipt.receipt.transactionHash;
}

/** Bundler receipt OR EntryPoint logs — whichever confirms first (Skandha receipt often lags on BSC). */
export async function waitForUserOpConfirmation(
  client: KernelAccountClient,
  publicClient: PublicClient,
  userOpHash: Hash,
  fromBlock: bigint
): Promise<Hash> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  tradeBundlerLog("waiting confirmation", {
    userOpHash,
    fromBlock: fromBlock.toString(),
    timeoutMs: CONFIRM_TIMEOUT_MS,
  });

  const bundlerPromise = waitViaBundlerReceipt(client, userOpHash);
  const entryPointPromise = waitViaEntryPointLogs(
    publicClient,
    userOpHash,
    fromBlock,
    deadline
  );

  try {
    return await Promise.any([bundlerPromise, entryPointPromise]);
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

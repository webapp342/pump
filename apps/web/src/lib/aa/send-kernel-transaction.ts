import type { KernelAccountClient } from "@zerodev/sdk";
import { sendUserOperation } from "viem/account-abstraction";
import { getAction } from "viem/utils";
import type { Address, Hash, Hex, PublicClient, TransactionReceipt } from "viem";
import { tradeBundlerLog } from "@/lib/aa/bundler-debug";
import { tradeTraceStep } from "@/lib/trade-timing";
import {
  waitForUserOpConfirmation,
  type UserOpConfirmationOptions,
} from "@/lib/aa/wait-user-op-confirmation";

export type KernelTransactionCall = {
  to: Address;
  data?: Hex;
  value?: bigint;
};

export type KernelTransactionResult = {
  hash: Hash;
  receipt?: TransactionReceipt;
};

export type KernelSubmitResult = {
  userOpHash: Hash;
  fromBlock: bigint;
};

export type KernelSubmitOptions = {
  /** Runs in parallel with getBlockNumber + sendUserOperation (not serial). */
  preflight?: () => Promise<void>;
};

export async function submitKernelUserOperation(
  client: KernelAccountClient,
  publicClient: PublicClient,
  call: KernelTransactionCall,
  options?: KernelSubmitOptions
): Promise<KernelSubmitResult> {
  const account = client.account;
  if (!account) {
    throw new Error("Smart account not ready.");
  }

  const parallelT0 = performance.now();
  tradeTraceStep("bundler.send_user_op.start", {
    to: call.to,
    value: call.value?.toString() ?? "0",
  });
  tradeTraceStep("chain.get_block_number.start");
  if (options?.preflight) {
    tradeTraceStep("ux.scw_preflight.start", { parallel: true });
  }

  const preflightP = options?.preflight?.() ?? Promise.resolve();

  const [fromBlock, , userOpHash] = await Promise.all([
    publicClient.getBlockNumber().then((block) => {
      tradeTraceStep("chain.get_block_number.done", {
        block: block.toString(),
        ms: Math.round(performance.now() - parallelT0),
      });
      return block;
    }),
    preflightP.then(() => {
      if (options?.preflight) {
        tradeTraceStep("ux.scw_preflight.done", {
          parallel: true,
          ms: Math.round(performance.now() - parallelT0),
        });
      }
    }),
    getAction(client, sendUserOperation, "sendUserOperation")({
      account,
      calls: [
        {
          to: call.to,
          data: call.data ?? "0x",
          value: call.value ?? 0n,
        },
      ],
    }),
  ]);

  const sendMs = Math.round(performance.now() - parallelT0);
  tradeTraceStep("bundler.send_user_op.done", { userOpHash, ms: sendMs });
  tradeBundlerLog("userOp submitted", {
    userOpHash,
    fromBlock: fromBlock.toString(),
    submitMs: sendMs,
  });

  return { userOpHash, fromBlock };
}

export async function confirmKernelUserOperation(
  client: KernelAccountClient,
  publicClient: PublicClient,
  userOpHash: Hash,
  fromBlock: bigint,
  options?: UserOpConfirmationOptions
): Promise<KernelTransactionResult> {
  const confirmT0 = performance.now();
  tradeTraceStep("bundler.wait_confirm.start", { userOpHash });
  const { txHash, receipt, confirmPath } = await waitForUserOpConfirmation(
    client,
    publicClient,
    userOpHash,
    fromBlock,
    options
  );
  const confirmMs = Math.round(performance.now() - confirmT0);

  tradeTraceStep("bundler.wait_confirm.done", {
    userOpHash,
    txHash,
    confirmPath,
    hasReceipt: Boolean(receipt),
    ms: confirmMs,
  });
  tradeBundlerLog("userOp confirmed", {
    userOpHash,
    txHash,
    hasReceipt: Boolean(receipt),
    confirmMs,
    confirmPath,
  });

  return { hash: txHash, receipt };
}

export async function sendKernelTransaction(
  client: KernelAccountClient,
  publicClient: PublicClient,
  call: KernelTransactionCall,
  options?: UserOpConfirmationOptions
): Promise<KernelTransactionResult> {
  const { userOpHash, fromBlock } = await submitKernelUserOperation(
    client,
    publicClient,
    call
  );
  return confirmKernelUserOperation(client, publicClient, userOpHash, fromBlock, options);
}

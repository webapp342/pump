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

export async function sendKernelTransaction(
  client: KernelAccountClient,
  publicClient: PublicClient,
  call: KernelTransactionCall,
  options?: UserOpConfirmationOptions
): Promise<KernelTransactionResult> {
  const account = client.account;
  if (!account) {
    throw new Error("Smart account not ready.");
  }

  const submitT0 = performance.now();
  tradeTraceStep("chain.get_block_number.start");
  const fromBlock = await publicClient.getBlockNumber();
  tradeTraceStep("chain.get_block_number.done", {
    block: fromBlock.toString(),
    ms: Math.round(performance.now() - submitT0),
  });

  const sendT0 = performance.now();
  tradeTraceStep("bundler.send_user_op.start", {
    to: call.to,
    value: call.value?.toString() ?? "0",
  });

  const userOpHash = await getAction(client, sendUserOperation, "sendUserOperation")({
    account,
    calls: [
      {
        to: call.to,
        data: call.data ?? "0x",
        value: call.value ?? 0n,
      },
    ],
  });

  const sendMs = Math.round(performance.now() - sendT0);
  tradeTraceStep("bundler.send_user_op.done", { userOpHash, ms: sendMs });
  tradeBundlerLog("userOp submitted", {
    userOpHash,
    fromBlock: fromBlock.toString(),
    submitMs: sendMs,
  });

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

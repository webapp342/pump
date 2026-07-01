import { createKernelAccountClient,
  type KernelAccountClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { prepareUserOperation as viemPrepareUserOperation } from "viem/account-abstraction";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { pumpChain, rpcUrl } from "@/config/chain";
import { erc20Abi } from "@/lib/abis/erc20";
import { createBundlerTransport } from "@/lib/aa/bundler-transport";
import { resolveTradeUserOpGasPrice, resolveUserOpGasPrice } from "@/lib/aa/pimlico-gas-price";
import { sendKernelTransaction } from "@/lib/aa/send-kernel-transaction";
import { assertScwReadyForUserOp } from "@/lib/aa/scw-preflight";
import {
  bumpGasLimit,
  MIN_VERIFICATION_GAS,
  MIN_VERIFICATION_GAS_DEPLOY,
  MIN_CALL_GAS_LIMIT,
  MIN_PRE_VERIFICATION_GAS,
} from "@/lib/aa/user-op-prefund";

export const entryPoint = getEntryPoint("0.7");
export const kernelVersion = KERNEL_V3_1;

function userOpNeedsAccountDeploy(userOp: {
  factory?: Address | null;
  factoryData?: Hex | null;
}): boolean {
  const factory = userOp.factory;
  const factoryData = userOp.factoryData;
  if (!factory || factory === "0x0000000000000000000000000000000000000000") {
    return false;
  }
  return Boolean(factoryData && factoryData !== "0x");
}

type PreparedUserOpGas = {
  factory?: Address | null;
  factoryData?: Hex | null;
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  preVerificationGas: bigint;
};

function createKernelUserOperationConfig(
  publicClient: PublicClient,
  options?: { tradeGas?: boolean }
) {
  const prepareUserOperation = (async (client, args) => {
    const userOp = await viemPrepareUserOperation(client, args);
    const gas = userOp as typeof userOp & PreparedUserOpGas;
    const deploy = userOpNeedsAccountDeploy(gas);
    const vglFloor = deploy ? MIN_VERIFICATION_GAS_DEPLOY : MIN_VERIFICATION_GAS;

    return {
      ...userOp,
      verificationGasLimit: bumpGasLimit(gas.verificationGasLimit, vglFloor),
      callGasLimit: bumpGasLimit(gas.callGasLimit, MIN_CALL_GAS_LIMIT),
      preVerificationGas: bumpGasLimit(gas.preVerificationGas, MIN_PRE_VERIFICATION_GAS),
    };
  }) as typeof viemPrepareUserOperation;

  const resolveFees = options?.tradeGas ? resolveTradeUserOpGasPrice : resolveUserOpGasPrice;

  return {
    estimateFeesPerGas: () => resolveFees(() => publicClient.getGasPrice()),
    prepareUserOperation,
  };
}

export function createPumpPublicClient(): PublicClient {
  return createPublicClient({
    chain: pumpChain,
    transport: http(rpcUrl),
  });
}

export function createKernelClientFromAccount(
  account: NonNullable<KernelAccountClient["account"]>,
  publicClient: PublicClient,
  options?: { fastPolling?: boolean; tradeGas?: boolean }
): KernelAccountClient {
  return createKernelAccountClient({
    account,
    chain: pumpChain,
    bundlerTransport: createBundlerTransport(),
    client: publicClient,
    pollingInterval: options?.fastPolling ? 200 : 2_000,
    userOperation: createKernelUserOperationConfig(publicClient, {
      tradeGas: options?.tradeGas,
    }),
  });
}

export async function withdrawFromKernelClient(
  client: KernelAccountClient,
  to: Address,
  value: bigint
): Promise<Hex> {
  if (!client.account) {
    throw new Error("Smart account not ready.");
  }

  await assertScwReadyForUserOp(client.account.address, value);

  return sendKernelTransaction(client, createPumpPublicClient(), {
    to,
    value,
    data: "0x",
  }).then((r) => r.hash);
}

export async function withdrawTokenFromKernelClient(
  client: KernelAccountClient,
  token: Address,
  to: Address,
  amount: bigint
): Promise<Hex> {
  if (!client.account) {
    throw new Error("Smart account not ready.");
  }

  await assertScwReadyForUserOp(client.account.address, 0n);

  return sendKernelTransaction(client, createPumpPublicClient(), {
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, amount],
    }),
  }).then((r) => r.hash);
}

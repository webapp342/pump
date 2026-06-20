import {
  createKernelAccountClient,
  type KernelAccountClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { prepareUserOperation as viemPrepareUserOperation } from "viem/account-abstraction";
import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { pumpChain, rpcUrl } from "@/config/chain";
import { createBundlerTransport } from "@/lib/aa/bundler-transport";
import { resolveUserOpGasPrice } from "@/lib/aa/pimlico-gas-price";
import { sendKernelTransaction } from "@/lib/aa/send-kernel-transaction";
import { assertScwReadyForUserOp } from "@/lib/aa/scw-preflight";

export const entryPoint = getEntryPoint("0.7");
export const kernelVersion = KERNEL_V3_1;

/** Skandha can underestimate Kernel deploy + ECDSA validation on BSC (AA26). */
const GAS_BUFFER_NUM = 13n;
const GAS_BUFFER_DEN = 10n;
const MIN_VERIFICATION_GAS = 150_000n;
const MIN_VERIFICATION_GAS_DEPLOY = 400_000n;

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function bumpGasLimit(value: bigint, floor: bigint): bigint {
  const buffered = (value * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;
  return maxBigInt(buffered, floor);
}

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

function createKernelUserOperationConfig(publicClient: PublicClient) {
  const prepareUserOperation = (async (client, args) => {
    const userOp = await viemPrepareUserOperation(client, args);
    const gas = userOp as typeof userOp & PreparedUserOpGas;
    const deploy = userOpNeedsAccountDeploy(gas);
    const vglFloor = deploy ? MIN_VERIFICATION_GAS_DEPLOY : MIN_VERIFICATION_GAS;

    return {
      ...userOp,
      verificationGasLimit: bumpGasLimit(gas.verificationGasLimit, vglFloor),
      callGasLimit: bumpGasLimit(gas.callGasLimit, 80_000n),
      preVerificationGas: bumpGasLimit(gas.preVerificationGas, 40_000n),
    };
  }) as typeof viemPrepareUserOperation;

  return {
    estimateFeesPerGas: () => resolveUserOpGasPrice(() => publicClient.getGasPrice()),
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
  publicClient: PublicClient
): KernelAccountClient {
  return createKernelAccountClient({
    account,
    chain: pumpChain,
    bundlerTransport: createBundlerTransport(),
    client: publicClient,
    pollingInterval: 2_000,
    userOperation: createKernelUserOperationConfig(publicClient),
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
  });
}

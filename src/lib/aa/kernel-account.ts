import {
  createKernelAccountClient,
  type KernelAccountClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { prepareUserOperation as viemPrepareUserOperation } from "viem/account-abstraction";
import {
  createPublicClient,
  http,
  parseGwei,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { pumpChain, rpcUrl } from "@/config/chain";
import { createBundlerTransport } from "@/lib/aa/bundler-transport";
import { assertScwReadyForUserOp } from "@/lib/aa/scw-preflight";

export const entryPoint = getEntryPoint("0.7");
export const kernelVersion = KERNEL_V3_1;

/** BSC often reports sub-1 gwei; bundler rejects UserOps below 1 gwei maxFee. */
const MIN_MAX_FEE_PER_GAS = parseGwei("1");
const MIN_PRIORITY_FEE_PER_GAS = parseGwei("0.05");

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

function createKernelUserOperationConfig(publicClient: PublicClient) {
  return {
    estimateFeesPerGas: async () => {
      const gasPrice = await publicClient.getGasPrice();
      return {
        maxFeePerGas: maxBigInt(gasPrice, MIN_MAX_FEE_PER_GAS),
        maxPriorityFeePerGas: maxBigInt(gasPrice / 10n, MIN_PRIORITY_FEE_PER_GAS),
      };
    },
    prepareUserOperation: async (
      client: Parameters<typeof viemPrepareUserOperation>[0],
      args: Parameters<typeof viemPrepareUserOperation>[1]
    ) => {
      const userOp = await viemPrepareUserOperation(client, args);
      const deploy = userOpNeedsAccountDeploy(userOp);
      const vglFloor = deploy ? MIN_VERIFICATION_GAS_DEPLOY : MIN_VERIFICATION_GAS;

      return {
        ...userOp,
        verificationGasLimit: bumpGasLimit(userOp.verificationGasLimit, vglFloor),
        callGasLimit: bumpGasLimit(userOp.callGasLimit, 80_000n),
        preVerificationGas: bumpGasLimit(userOp.preVerificationGas, 40_000n),
      };
    },
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

  return client.sendTransaction({
    account: client.account,
    to,
    value,
    data: "0x",
    chain: pumpChain,
  } as Parameters<typeof client.sendTransaction>[0]);
}

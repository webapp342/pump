import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  addressToEmptyAccount,
  createKernelAccount,
  createKernelAccountClient,
  KernelEIP1193Provider,
  type KernelAccountClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import {
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  createPublicClient,
  http,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { pumpChain, rpcUrl } from "@/config/chain";
import { getPimlicoBundlerUrl } from "@/lib/aa/pimlico-client";
import { buildPumpSessionPolicies } from "@/lib/aa/session-permissions";
import type { StoredSession } from "@/lib/aa/session-storage";

export const entryPoint = getEntryPoint("0.7");
export const kernelVersion = KERNEL_V3_1;

export function createPumpPublicClient(): PublicClient {
  return createPublicClient({
    chain: pumpChain,
    transport: http(rpcUrl),
  });
}

export async function createMasterKernelAccount(eoaProvider: EIP1193Provider) {
  const publicClient = createPumpPublicClient();
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: eoaProvider,
    entryPoint,
    kernelVersion,
  });
  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  });
  return { account, publicClient, ecdsaValidator };
}

export function createKernelClientFromAccount(
  account: Awaited<ReturnType<typeof createKernelAccount>>,
  publicClient: PublicClient
): KernelAccountClient {
  return createKernelAccountClient({
    account,
    chain: pumpChain,
    bundlerTransport: http(getPimlicoBundlerUrl()),
    client: publicClient,
    paymaster: true,
  });
}

/** Kernel EIP-1193 provider — wagmi reads/writes use SCW address, not embedded EOA. */
export async function createKernelEip1193Provider(
  eoaProvider: EIP1193Provider
): Promise<EIP1193Provider> {
  const { account, publicClient } = await createMasterKernelAccount(eoaProvider);
  const kernelClient = createKernelClientFromAccount(account, publicClient);
  return new KernelEIP1193Provider(kernelClient) as EIP1193Provider;
}

export async function getScwAddressFromSigner(eoaProvider: EIP1193Provider): Promise<Address> {
  const { account } = await createMasterKernelAccount(eoaProvider);
  return account.address;
}

/**
 * Master (Privy embedded) signs once to enable session key on-chain.
 * serializePermissionAccount triggers getPluginEnableSignature — OS/Privy prompt, not MetaMask.
 */
export async function grantSessionFromSigner(
  eoaProvider: EIP1193Provider
): Promise<StoredSession> {
  const { publicClient, ecdsaValidator } = await createMasterKernelAccount(eoaProvider);

  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  const emptySessionKeySigner = await toECDSASigner({
    signer: addressToEmptyAccount(sessionKeyAccount.address),
  });

  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    kernelVersion,
    signer: emptySessionKeySigner,
    policies: buildPumpSessionPolicies(),
  });

  const sessionKeyKernelAccount = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionPlugin,
    },
  });

  const approval = await serializePermissionAccount(
    sessionKeyKernelAccount as Parameters<typeof serializePermissionAccount>[0],
    sessionPrivateKey
  );

  return {
    approval,
    privateKey: sessionPrivateKey,
    grantedAt: Date.now(),
  };
}

export async function createSessionKernelClient(
  stored: StoredSession
): Promise<KernelAccountClient | null> {
  const publicClient = createPumpPublicClient();
  const sessionKeyAccount = privateKeyToAccount(stored.privateKey);
  const sessionKeySigner = await toECDSASigner({ signer: sessionKeyAccount });

  try {
    const sessionAccount = await deserializePermissionAccount(
      publicClient,
      entryPoint,
      kernelVersion,
      stored.approval,
      sessionKeySigner
    );
    return createKernelClientFromAccount(sessionAccount, publicClient);
  } catch {
    return null;
  }
}

export async function withdrawFromSessionClient(
  client: KernelAccountClient,
  to: Address,
  value: bigint
): Promise<Hex> {
  if (!client.account) {
    throw new Error("Smart account not ready.");
  }
  return client.sendTransaction({
    account: client.account,
    to,
    value,
    data: "0x",
    chain: pumpChain,
  } as Parameters<typeof client.sendTransaction>[0]);
}

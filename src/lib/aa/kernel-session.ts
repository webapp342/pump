import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  createKernelAccount,
  KernelEIP1193Provider,
  type KernelAccountClient,
} from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, EIP1193Provider, Hex } from "viem";
import {
  createKernelClientFromAccount,
  createPumpPublicClient,
  entryPoint,
  kernelVersion,
} from "@/lib/aa/kernel-account";

export type KernelWalletSession = {
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  eoaAddress: Address;
  scwAddress: Address;
  kernelClient: KernelAccountClient;
  provider: EIP1193Provider;
};

export async function deriveWalletAddresses(privateKey: Hex): Promise<{
  eoaAddress: Address;
  scwAddress: Address;
}> {
  const publicClient = createPumpPublicClient();
  const localAccount = privateKeyToAccount(privateKey);

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: localAccount,
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  });

  return {
    eoaAddress: localAccount.address,
    scwAddress: account.address,
  };
}

export async function buildKernelWalletSession(input: {
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  privateKey: Hex;
}): Promise<KernelWalletSession> {
  const publicClient = createPumpPublicClient();
  const localAccount = privateKeyToAccount(input.privateKey);

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: localAccount,
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  });

  const kernelClient = createKernelClientFromAccount(account, publicClient);
  const provider = new KernelEIP1193Provider(kernelClient) as EIP1193Provider;

  return {
    telegramId: input.telegramId,
    telegramUsername: input.telegramUsername,
    firstName: input.firstName,
    eoaAddress: localAccount.address,
    scwAddress: account.address,
    kernelClient,
    provider,
  };
}

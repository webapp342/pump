"use client";

import { useEmbeddedSmartAccountConnector } from "@privy-io/wagmi";
import { createKernelEip1193Provider } from "@/lib/aa/kernel-account";

/** Registers Kernel SCW as wagmi active account — useAccount().address returns SCW, not EOA. */
export function SmartAccountConnectorSetup() {
  useEmbeddedSmartAccountConnector({
    getSmartAccountFromSigner: async ({ signer }) => createKernelEip1193Provider(signer),
  });
  return null;
}

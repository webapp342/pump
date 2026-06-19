"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { WagmiProvider } from "wagmi";
import { privyAppId, privyConfig, isPrivyConfigured } from "@/lib/privy-config";
import { wagmiConfig } from "@/lib/wagmi";
import { PumpWalletProvider, PumpWalletProviderStub } from "@/components/wallet/PumpWalletProvider";
import { SmartAccountConnectorSetup } from "@/components/wallet/SmartAccountConnectorSetup";
import { WalletFundingProvider } from "@/components/wallet/WalletFundingProvider";

function MissingPrivyConfig({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] p-2">
        <p className="notice-warning pointer-events-auto text-center text-caption">
          Set <code className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</code> in{" "}
          <code className="font-mono">.env</code> to enable login.
        </p>
      </div>
    </>
  );
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  if (!isPrivyConfigured()) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <PumpWalletProviderStub>
            <WalletFundingProvider>
              <MissingPrivyConfig>{children}</MissingPrivyConfig>
            </WalletFundingProvider>
          </PumpWalletProviderStub>
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={wagmiConfig}>
          <SmartAccountConnectorSetup />
          <PumpWalletProvider>
            <WalletFundingProvider>{children}</WalletFundingProvider>
          </PumpWalletProvider>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

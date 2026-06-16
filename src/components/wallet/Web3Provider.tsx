"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { modal } from "@reown/appkit/react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getAppKitThemeOptions } from "@/lib/appkit-theme";
import type { ThemeId } from "@/lib/theme";
import { WalletFundingProvider } from "@/components/wallet/WalletFundingProvider";
import { wagmiAdapter } from "@/lib/appkit";

function AppKitThemeSync() {
  const { theme } = useTheme();
  const lastThemeRef = useRef<ThemeId | null>(null);

  useEffect(() => {
    if (!modal || lastThemeRef.current === theme) return;
    lastThemeRef.current = theme;

    const { themeMode, themeVariables } = getAppKitThemeOptions(theme);
    modal.setThemeMode(themeMode);
    modal.setThemeVariables(themeVariables);
  }, [theme]);

  return null;
}

export function Web3Provider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies?: string | null;
}) {
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

  const initialState = useMemo(
    () => cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies),
    [cookies]
  );

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <AppKitThemeSync />
        <WalletFundingProvider>{children}</WalletFundingProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

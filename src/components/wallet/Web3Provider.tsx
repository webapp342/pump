"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppKitTheme } from "@reown/appkit/react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getAppKitThemeOptions } from "@/lib/appkit-theme";
import { wagmiAdapter } from "@/lib/appkit";

function AppKitThemeSync() {
  const { theme } = useTheme();
  const { setThemeMode, setThemeVariables } = useAppKitTheme();

  useEffect(() => {
    const { themeMode, themeVariables } = getAppKitThemeOptions(theme);
    setThemeMode(themeMode);
    setThemeVariables(themeVariables);
  }, [theme, setThemeMode, setThemeVariables]);

  return null;
}

export function Web3Provider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies?: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <AppKitThemeSync />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

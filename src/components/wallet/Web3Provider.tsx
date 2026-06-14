"use client";

import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getRainbowAccent, isDarkTheme } from "@/lib/theme";
import { wagmiConfig } from "@/lib/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { theme } = useTheme();

  const rainbowTheme = useMemo(() => {
    const { accentColor, accentColorForeground } = getRainbowAccent(theme);
    const base = {
      accentColor,
      accentColorForeground,
      borderRadius: "medium" as const,
      fontStack: "system" as const,
      overlayBlur: "large" as const,
    };
    return isDarkTheme(theme) ? darkTheme(base) : lightTheme(base);
  }, [theme]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

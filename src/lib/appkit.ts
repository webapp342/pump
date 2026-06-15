"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { bsc, bscTestnet } from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "@wagmi/core";
import { http } from "wagmi";
import { CHAIN_ID, rpcUrl } from "@/config/chain";
import { getAppKitThemeOptions } from "@/lib/appkit-theme";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3012";

export const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";

export const metadata = {
  name: "Pump",
  description: "Launch, trade, and earn on BSC bonding curves.",
  url: appUrl,
  icons: [`${appUrl}/opengraph-image`],
};

export const pumpAppKitNetwork = CHAIN_ID === 56 ? bsc : bscTestnet;

export const appKitNetworks = [pumpAppKitNetwork] as [typeof pumpAppKitNetwork, ...typeof pumpAppKitNetwork[]];

const initialTheme = getAppKitThemeOptions("slate");

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks: appKitNetworks,
  transports: {
    [pumpAppKitNetwork.id]: http(rpcUrl),
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: appKitNetworks,
  defaultNetwork: pumpAppKitNetwork,
  metadata,
  themeMode: initialTheme.themeMode,
  themeVariables: initialTheme.themeVariables,
  features: {
    analytics: false,
    email: true,
    socials: ["google", "apple", "discord", "github"],
    emailShowWallets: true,
  },
});

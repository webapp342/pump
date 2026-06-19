import type { PrivyClientConfig } from "@privy-io/react-auth";
import { pumpChain } from "@/config/chain";

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function isPrivyConfigured(): boolean {
  return Boolean(privyAppId && privyAppId !== "CHANGE_ME");
}

export const privyConfig: PrivyClientConfig = {
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
  },
  defaultChain: pumpChain,
  supportedChains: [pumpChain],
  loginMethods: ["email", "google", "passkey"],
  appearance: {
    theme: "dark",
    accentColor: "#1a767a",
    logo: undefined,
  },
};

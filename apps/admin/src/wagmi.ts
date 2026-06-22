/** Admin console only — injected browser wallet (MetaMask). Never import in Pump UI. */
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { pumpChain, rpcUrl } from "@/config/chain";

/** Generic browser wallet (MetaMask, Rabby, etc.) — do not use target: "metaMask" (fragile). */
export const browserWallet = injected({ shimDisconnect: true });

export const wagmiConfig = createConfig({
  chains: [pumpChain],
  connectors: [browserWallet],
  transports: {
    [pumpChain.id]: http(rpcUrl),
  },
});

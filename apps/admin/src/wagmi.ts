/** Admin console only — injected browser wallet (MetaMask). Never import in Pump UI. */
import { createConfig, createStorage, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { pumpChain, rpcUrl } from "@/config/chain";

/** Generic browser wallet — isolated from main Pump app wagmi persistence. */
export const browserWallet = injected({
  shimDisconnect: true,
  unstable_shimAsyncInject: true,
});

export const wagmiConfig = createConfig({
  chains: [pumpChain],
  connectors: [browserWallet],
  transports: {
    [pumpChain.id]: http(rpcUrl),
  },
  storage: createStorage({
    key: "pump-admin-wagmi",
  }),
  ssr: false,
});

/** Main Pump UI uses pump-kernel in default `wagmi.store` — breaks admin reconnect. */
export function clearConflictingPumpWagmiStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("wagmi.store");
    if (raw?.includes("pump-kernel")) {
      window.localStorage.removeItem("wagmi.store");
    }
  } catch {
    // ignore
  }
}

import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { pumpChain, rpcUrl } from "@/config/chain";

export const wagmiConfig = createConfig({
  chains: [pumpChain],
  transports: {
    [pumpChain.id]: http(rpcUrl),
  },
  ssr: true,
});

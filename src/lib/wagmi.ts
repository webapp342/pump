import { createConfig, createConnector } from "wagmi";
import { http, type EIP1193Provider } from "viem";
import { pumpChain, rpcUrl } from "@/config/chain";

let activeProvider: EIP1193Provider | null = null;
let activeAddress: `0x${string}` | null = null;

export function setPumpConnectorSession(
  provider: EIP1193Provider,
  address: `0x${string}`
): void {
  activeProvider = provider;
  activeAddress = address;
}

export function clearPumpConnectorSession(): void {
  activeProvider = null;
  activeAddress = null;
}

export function getPumpConnectorSession(): {
  provider: EIP1193Provider;
  address: `0x${string}`;
} | null {
  if (!activeProvider || !activeAddress) return null;
  return { provider: activeProvider, address: activeAddress };
}

/** @deprecated Use setPumpConnectorSession */
export const setZeroDevConnectorSession = setPumpConnectorSession;
/** @deprecated Use clearPumpConnectorSession */
export const clearZeroDevConnectorSession = clearPumpConnectorSession;
/** @deprecated Use getPumpConnectorSession */
export const getZeroDevConnectorSession = getPumpConnectorSession;

function pumpKernelConnector() {
  return createConnector((config) => ({
    id: "pump-kernel",
    name: "Pump Wallet",
    type: "pumpKernel" as const,

    async setup() {},

    async connect({ chainId, withCapabilities } = {}) {
      const session = getPumpConnectorSession();
      if (!session) {
        throw new Error("Sign in required.");
      }
      const resolvedChainId = chainId ?? pumpChain.id;
      config.emitter.emit("connect", {
        accounts: [session.address],
        chainId: resolvedChainId,
      });
      return {
        accounts: (withCapabilities
          ? [{ address: session.address, capabilities: {} }]
          : [session.address]) as never,
        chainId: resolvedChainId,
      };
    },

    async disconnect() {
      config.emitter.emit("disconnect");
    },

    async getAccounts() {
      return activeAddress ? [activeAddress] : [];
    },

    async getChainId() {
      return pumpChain.id;
    },

    async getProvider() {
      return activeProvider ?? undefined;
    },

    async isAuthorized() {
      return Boolean(activeProvider && activeAddress);
    },

    async switchChain({ chainId }) {
      if (chainId !== pumpChain.id) {
        throw new Error(`Chain ${chainId} is not supported.`);
      }
      return pumpChain;
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}

export const wagmiConfig = createConfig({
  chains: [pumpChain],
  connectors: [pumpKernelConnector()],
  transports: {
    [pumpChain.id]: http(rpcUrl),
  },
  ssr: true,
});

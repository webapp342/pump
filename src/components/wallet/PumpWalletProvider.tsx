"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { KernelAccountClient } from "@zerodev/sdk";
import type { Address, EIP1193Provider } from "viem";
import {
  createSessionKernelClient,
  getScwAddressFromSigner,
  grantSessionFromSigner,
  withdrawFromSessionClient,
} from "@/lib/aa/kernel-account";
import {
  clearStoredSession,
  isSessionExpired,
  loadStoredSession,
  saveStoredSession,
  type StoredSession,
} from "@/lib/aa/session-storage";
import { SessionGrantModal } from "@/components/wallet/SessionGrantModal";

type PumpWalletContextValue = {
  ready: boolean;
  authenticated: boolean;
  /** Smart contract wallet (Kernel) — deposit/trade address, not embedded EOA. */
  scwAddress: Address | undefined;
  login: () => void;
  logout: () => Promise<void>;
  hasValidSession: boolean;
  sessionClient: KernelAccountClient | null;
  requestSessionGrant: () => void;
  grantSession: (remember: boolean) => Promise<void>;
  revokeSession: () => void;
  withdraw: (to: Address, value: bigint) => Promise<`0x${string}`>;
  sessionGrantOpen: boolean;
  sessionGrantLoading: boolean;
  sessionGrantError: string | null;
  closeSessionGrant: () => void;
};

const PumpWalletContext = createContext<PumpWalletContextValue | null>(null);

export function usePumpWallet() {
  const ctx = useContext(PumpWalletContext);
  if (!ctx) {
    throw new Error("usePumpWallet must be used within PumpWalletProvider");
  }
  return ctx;
}

const noopAsync = async () => {};

const stubPumpWallet: PumpWalletContextValue = {
  ready: true,
  authenticated: false,
  scwAddress: undefined,
  login: () => {},
  logout: noopAsync,
  hasValidSession: false,
  sessionClient: null,
  requestSessionGrant: () => {},
  grantSession: noopAsync,
  revokeSession: () => {},
  withdraw: async () => {
    throw new Error("Configure NEXT_PUBLIC_PRIVY_APP_ID");
  },
  sessionGrantOpen: false,
  sessionGrantLoading: false,
  sessionGrantError: null,
  closeSessionGrant: () => {},
};

export function PumpWalletProviderStub({ children }: { children: ReactNode }) {
  return (
    <PumpWalletContext.Provider value={stubPumpWallet}>{children}</PumpWalletContext.Provider>
  );
}

async function getEmbeddedProvider(wallets: ReturnType<typeof useWallets>["wallets"]) {
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  if (!embedded) return null;
  return (await embedded.getEthereumProvider()) as EIP1193Provider;
}

export function PumpWalletProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const [scwAddress, setScwAddress] = useState<Address | undefined>();
  const [sessionClient, setSessionClient] = useState<KernelAccountClient | null>(null);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [sessionGrantOpen, setSessionGrantOpen] = useState(false);
  const [sessionGrantLoading, setSessionGrantLoading] = useState(false);
  const [sessionGrantError, setSessionGrantError] = useState<string | null>(null);

  const resolveScw = useCallback(async () => {
    if (!authenticated) {
      setScwAddress(undefined);
      return;
    }
    const provider = await getEmbeddedProvider(wallets);
    if (!provider) return;
    try {
      const address = await getScwAddressFromSigner(provider);
      setScwAddress(address);
    } catch {
      setScwAddress(undefined);
    }
  }, [authenticated, wallets]);

  const hydrateSession = useCallback(async () => {
    const stored = loadStoredSession();
    if (!stored || isSessionExpired(stored.grantedAt)) {
      if (stored) clearStoredSession();
      setSessionClient(null);
      setHasValidSession(false);
      return;
    }
    const client = await createSessionKernelClient(stored);
    setSessionClient(client);
    setHasValidSession(Boolean(client));
  }, []);

  useEffect(() => {
    void resolveScw();
  }, [resolveScw]);

  useEffect(() => {
    if (!authenticated) {
      setSessionClient(null);
      setHasValidSession(false);
      return;
    }
    void hydrateSession();
  }, [authenticated, hydrateSession]);

  useEffect(() => {
    if (!authenticated || hasValidSession) return;
    const stored = loadStoredSession();
    if (!stored) {
      setSessionGrantOpen(true);
    }
  }, [authenticated, hasValidSession]);

  const requestSessionGrant = useCallback(() => {
    setSessionGrantError(null);
    setSessionGrantOpen(true);
  }, []);

  const closeSessionGrant = useCallback(() => {
    setSessionGrantOpen(false);
    setSessionGrantError(null);
  }, []);

  const grantSession = useCallback(
    async (remember: boolean) => {
      setSessionGrantLoading(true);
      setSessionGrantError(null);
      try {
        const provider = await getEmbeddedProvider(wallets);
        if (!provider) throw new Error("Embedded wallet not ready. Try again in a moment.");

        const stored: StoredSession = await grantSessionFromSigner(provider);
        if (remember) {
          saveStoredSession(stored);
        }
        const client = await createSessionKernelClient(stored);
        if (!client) throw new Error("Could not activate session key.");
        setSessionClient(client);
        setHasValidSession(true);
        setSessionGrantOpen(false);
      } catch (err) {
        setSessionGrantError(err instanceof Error ? err.message : "Session grant failed.");
        throw err;
      } finally {
        setSessionGrantLoading(false);
      }
    },
    [wallets]
  );

  const revokeSession = useCallback(() => {
    clearStoredSession();
    setSessionClient(null);
    setHasValidSession(false);
  }, []);

  const logout = useCallback(async () => {
    revokeSession();
    setScwAddress(undefined);
    await privyLogout();
  }, [privyLogout, revokeSession]);

  const withdraw = useCallback(
    async (to: Address, value: bigint) => {
      if (!sessionClient) {
        requestSessionGrant();
        throw new Error("Session grant required for withdraw.");
      }
      return withdrawFromSessionClient(sessionClient, to, value);
    },
    [sessionClient, requestSessionGrant]
  );

  const value = useMemo(
    () => ({
      ready,
      authenticated,
      scwAddress,
      login,
      logout,
      hasValidSession,
      sessionClient,
      requestSessionGrant,
      grantSession,
      revokeSession,
      withdraw,
      sessionGrantOpen,
      sessionGrantLoading,
      sessionGrantError,
      closeSessionGrant,
    }),
    [
      ready,
      authenticated,
      scwAddress,
      login,
      logout,
      hasValidSession,
      sessionClient,
      requestSessionGrant,
      grantSession,
      revokeSession,
      withdraw,
      sessionGrantOpen,
      sessionGrantLoading,
      sessionGrantError,
      closeSessionGrant,
    ]
  );

  return (
    <PumpWalletContext.Provider value={value}>
      {children}
      <SessionGrantModal />
    </PumpWalletContext.Provider>
  );
}

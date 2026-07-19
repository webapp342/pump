"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { KernelAccountClient } from "@zerodev/sdk";
import type { Address } from "viem";
import { useDisconnect } from "wagmi";
import {
  logoutPumpSession,
  restorePumpKernelSession,
  type PumpAccountSession,
} from "@/lib/aa/pump-account";
import { withdrawFromKernelClient, withdrawTokenFromKernelClient } from "@/lib/aa/kernel-account";
import {
  clearPumpConnectorSession,
  clearPumpWagmiPersistence,
  setPumpConnectorSession,
} from "@/lib/wagmi";
import { SignInModal } from "@/components/wallet/SignInModal";
import { isSolanaChainFamily } from "@/config/chain-family";
import {
  clearSolanaSilentSession,
  hydrateSolanaSilentSession,
} from "@/lib/solana/silent-session";

type PumpWalletContextValue = {
  ready: boolean;
  authenticated: boolean;
  authProvider: "telegram" | "google" | "apple" | undefined;
  accountId: string | undefined;
  displayName: string | null | undefined;
  telegramId: string | undefined;
  telegramUsername: string | null | undefined;
  telegramFirstName: string | null | undefined;
  scwAddress: Address | undefined;
  /** Custodial Solana trading address (Ed25519). Populated when CHAIN_FAMILY=solana. */
  solanaAddress: string | undefined;
  /** True once silent Solana session (in-memory key) is ready for popup-free txs. */
  solanaSessionReady: boolean;
  kernelClient: KernelAccountClient | null;
  login: () => void;
  logout: () => Promise<void>;
  withdraw: (to: Address, value: bigint) => Promise<`0x${string}`>;
  withdrawToken: (token: Address, to: Address, amount: bigint) => Promise<`0x${string}`>;
  /** Ensure Solana wallet + in-memory signer (no popup). */
  ensureSolanaSession: () => Promise<{ address: string }>;
};

const PumpWalletContext = createContext<PumpWalletContextValue | null>(null);

export function usePumpWallet() {
  const ctx = useContext(PumpWalletContext);
  if (!ctx) {
    throw new Error("usePumpWallet must be used within PumpWalletProvider");
  }
  return ctx;
}

const noopAsync = async () => {
  throw new Error("Configure sign-in providers in .env");
};

const stubPumpWallet: PumpWalletContextValue = {
  ready: true,
  authenticated: false,
  authProvider: undefined,
  accountId: undefined,
  displayName: undefined,
  telegramId: undefined,
  telegramUsername: undefined,
  telegramFirstName: undefined,
  scwAddress: undefined,
  solanaAddress: undefined,
  solanaSessionReady: false,
  kernelClient: null,
  login: () => {},
  logout: noopAsync,
  withdraw: noopAsync,
  withdrawToken: noopAsync,
  ensureSolanaSession: noopAsync,
};

export function PumpWalletProviderStub({ children }: { children: ReactNode }) {
  return (
    <PumpWalletContext.Provider value={stubPumpWallet}>{children}</PumpWalletContext.Provider>
  );
}

export function PumpWalletProvider({ children }: { children: ReactNode }) {
  const { disconnect } = useDisconnect();
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authProvider, setAuthProvider] = useState<"telegram" | "google" | "apple" | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [displayName, setDisplayName] = useState<string | null | undefined>();
  const [telegramId, setTelegramId] = useState<string | undefined>();
  const [telegramUsername, setTelegramUsername] = useState<string | null | undefined>();
  const [telegramFirstName, setTelegramFirstName] = useState<string | null | undefined>();
  const [scwAddress, setScwAddress] = useState<Address | undefined>();
  const [solanaAddress, setSolanaAddress] = useState<string | undefined>();
  const [solanaSessionReady, setSolanaSessionReady] = useState(false);
  const [kernelClient, setKernelClient] = useState<KernelAccountClient | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const applySession = useCallback((session: PumpAccountSession) => {
    setPumpConnectorSession(session.provider, session.scwAddress);
    setAuthProvider(session.authProvider);
    setAccountId(session.accountId);
    setDisplayName(session.displayName);
    setTelegramId(session.telegramId || undefined);
    setTelegramUsername(session.telegramUsername);
    setTelegramFirstName(session.firstName);
    setScwAddress(session.scwAddress);
    setKernelClient(session.kernelClient);
    setAuthenticated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const session = await restorePumpKernelSession();
        if (session && !cancelled) applySession(session);
      } catch {
        // ignore stale session
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => {
    if (!ready) return;
    if (authenticated) {
      setLoginModalOpen(false);
    }
  }, [ready, authenticated]);

  useEffect(() => {
    if (!ready || !authenticated || !isSolanaChainFamily) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await hydrateSolanaSilentSession();
        if (!cancelled) {
          setSolanaAddress(s.address);
          setSolanaSessionReady(true);
        }
      } catch {
        if (!cancelled) {
          setSolanaSessionReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  const ensureSolanaSession = useCallback(async () => {
    const s = await hydrateSolanaSilentSession();
    setSolanaAddress(s.address);
    setSolanaSessionReady(true);
    return { address: s.address };
  }, []);

  const login = useCallback(() => {
    setLoginModalOpen(true);
  }, []);

  const logout = useCallback(async () => {
    clearPumpConnectorSession();
    clearPumpWagmiPersistence();
    clearSolanaSilentSession();
    setAuthProvider(undefined);
    setAccountId(undefined);
    setDisplayName(undefined);
    setTelegramId(undefined);
    setTelegramUsername(undefined);
    setTelegramFirstName(undefined);
    setScwAddress(undefined);
    setSolanaAddress(undefined);
    setSolanaSessionReady(false);
    setKernelClient(null);
    setAuthenticated(false);
    await logoutPumpSession();
    await disconnect();
  }, [disconnect]);

  const withdraw = useCallback(
    async (to: Address, value: bigint) => {
      if (!kernelClient) {
        throw new Error("Sign in to withdraw.");
      }
      return withdrawFromKernelClient(kernelClient, to, value);
    },
    [kernelClient]
  );

  const withdrawToken = useCallback(
    async (token: Address, to: Address, amount: bigint) => {
      if (!kernelClient) {
        throw new Error("Sign in to withdraw.");
      }
      return withdrawTokenFromKernelClient(kernelClient, token, to, amount);
    },
    [kernelClient]
  );

  const value = useMemo(
    () => ({
      ready,
      authenticated,
      authProvider,
      accountId,
      displayName,
      telegramId,
      telegramUsername,
      telegramFirstName,
      scwAddress,
      solanaAddress,
      solanaSessionReady,
      kernelClient,
      login,
      logout,
      withdraw,
      withdrawToken,
      ensureSolanaSession,
    }),
    [
      ready,
      authenticated,
      authProvider,
      accountId,
      displayName,
      telegramId,
      telegramUsername,
      telegramFirstName,
      scwAddress,
      solanaAddress,
      solanaSessionReady,
      kernelClient,
      login,
      logout,
      withdraw,
      withdrawToken,
      ensureSolanaSession,
    ]
  );

  return (
    <PumpWalletContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <SignInModal
          open={loginModalOpen}
          onClose={() => setLoginModalOpen(false)}
          onSuccess={() => setLoginModalOpen(false)}
        />
      </Suspense>
    </PumpWalletContext.Provider>
  );
}

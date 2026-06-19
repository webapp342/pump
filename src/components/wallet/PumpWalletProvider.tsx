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
import type { KernelAccountClient } from "@zerodev/sdk";
import type { Address } from "viem";
import { useDisconnect } from "wagmi";
import {
  logoutTelegramSession,
  restoreTelegramKernelSession,
  type TelegramAccountSession,
} from "@/lib/aa/telegram-account";
import { withdrawFromKernelClient } from "@/lib/aa/kernel-account";
import {
  clearPumpConnectorSession,
  setPumpConnectorSession,
} from "@/lib/wagmi";
import { TelegramLoginModal } from "@/components/wallet/TelegramLoginModal";

type PumpWalletContextValue = {
  ready: boolean;
  authenticated: boolean;
  telegramId: string | undefined;
  telegramUsername: string | null | undefined;
  telegramFirstName: string | null | undefined;
  scwAddress: Address | undefined;
  kernelClient: KernelAccountClient | null;
  login: () => void;
  logout: () => Promise<void>;
  withdraw: (to: Address, value: bigint) => Promise<`0x${string}`>;
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
  throw new Error("Configure Telegram bot auth in .env");
};

const stubPumpWallet: PumpWalletContextValue = {
  ready: true,
  authenticated: false,
  telegramId: undefined,
  telegramUsername: undefined,
  telegramFirstName: undefined,
  scwAddress: undefined,
  kernelClient: null,
  login: () => {},
  logout: noopAsync,
  withdraw: noopAsync,
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
  const [telegramId, setTelegramId] = useState<string | undefined>();
  const [telegramUsername, setTelegramUsername] = useState<string | null | undefined>();
  const [telegramFirstName, setTelegramFirstName] = useState<string | null | undefined>();
  const [scwAddress, setScwAddress] = useState<Address | undefined>();
  const [kernelClient, setKernelClient] = useState<KernelAccountClient | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const applySession = useCallback((session: TelegramAccountSession) => {
    setPumpConnectorSession(session.provider, session.scwAddress);
    setTelegramId(session.telegramId);
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
        const session = await restoreTelegramKernelSession();
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

  const login = useCallback(() => {
    setLoginModalOpen(true);
  }, []);

  const onTelegramSuccess = useCallback(
    (session: TelegramAccountSession) => {
      applySession(session);
      setLoginModalOpen(false);
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    clearPumpConnectorSession();
    setTelegramId(undefined);
    setTelegramUsername(undefined);
    setTelegramFirstName(undefined);
    setScwAddress(undefined);
    setKernelClient(null);
    setAuthenticated(false);
    await logoutTelegramSession();
    disconnect();
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

  const value = useMemo(
    () => ({
      ready,
      authenticated,
      telegramId,
      telegramUsername,
      telegramFirstName,
      scwAddress,
      kernelClient,
      login,
      logout,
      withdraw,
    }),
    [
      ready,
      authenticated,
      telegramId,
      telegramUsername,
      telegramFirstName,
      scwAddress,
      kernelClient,
      login,
      logout,
      withdraw,
    ]
  );

  return (
    <PumpWalletContext.Provider value={value}>
      {children}
      <TelegramLoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={onTelegramSuccess}
      />
    </PumpWalletContext.Provider>
  );
}

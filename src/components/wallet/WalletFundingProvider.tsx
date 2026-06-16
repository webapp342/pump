"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { openOnRamp } from "@/lib/wallet-funding";
import { WalletFundingModal } from "@/components/wallet/WalletFundingModal";

export type WalletFundingView = "choice" | "deposit";

export type WalletFundingOptions = {
  title?: string;
  message?: string;
  initialView?: WalletFundingView;
};

type WalletFundingContextValue = {
  openDeposit: () => void;
  openFundChoice: (options?: WalletFundingOptions) => void;
  openOnRamp: () => void;
};

const WalletFundingContext = createContext<WalletFundingContextValue | null>(null);

export function useWalletFunding() {
  const ctx = useContext(WalletFundingContext);
  if (!ctx) {
    throw new Error("useWalletFunding must be used within WalletFundingProvider");
  }
  return ctx;
}

export function WalletFundingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<WalletFundingView>("choice");
  const [options, setOptions] = useState<WalletFundingOptions>({});
  const [canReturnToChoice, setCanReturnToChoice] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const openDeposit = useCallback(() => {
    setOptions({});
    setCanReturnToChoice(false);
    setView("deposit");
    setOpen(true);
  }, []);

  const openFundChoice = useCallback((opts?: WalletFundingOptions) => {
    setOptions(opts ?? {});
    setCanReturnToChoice(true);
    setView(opts?.initialView ?? "choice");
    setOpen(true);
  }, []);

  const handleOpenOnRamp = useCallback(() => {
    setOpen(false);
    openOnRamp();
  }, []);

  const value = useMemo(
    () => ({
      openDeposit,
      openFundChoice,
      openOnRamp: handleOpenOnRamp,
    }),
    [openDeposit, openFundChoice, handleOpenOnRamp]
  );

  return (
    <WalletFundingContext.Provider value={value}>
      {children}
      <WalletFundingModal
        open={open}
        view={view}
        options={options}
        canReturnToChoice={canReturnToChoice}
        onClose={close}
        onViewChange={setView}
        onOpenOnRamp={handleOpenOnRamp}
      />
    </WalletFundingContext.Provider>
  );
}

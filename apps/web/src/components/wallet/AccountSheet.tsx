"use client";

import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { WalletAccountPanel, type WalletAccountPanelProps } from "@/components/wallet/WalletAccountPanel";

type AccountSheetProps = Omit<WalletAccountPanelProps, "variant"> & {
  open: boolean;
};

/** Mobile settings sheet (no balance / address / funding — those live on Portfolio). */
export function AccountSheet({ open, onClose, ...panelProps }: AccountSheetProps) {
  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Settings"
      title="Settings"
      zIndex={100}
      panelClassName="max-h-[min(80dvh,28rem)] lg:hidden"
      bodyClassName="wallet-account-sheet__body"
      dragEntirePanel={false}
    >
      <WalletAccountPanel {...panelProps} onClose={onClose} variant="sheet" />
    </AppBottomSheet>
  );
}

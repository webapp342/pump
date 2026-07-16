"use client";

import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { WalletAccountPanel, type WalletAccountPanelProps } from "@/components/wallet/WalletAccountPanel";

type AccountSheetProps = WalletAccountPanelProps & {
  open: boolean;
};

/**
 * Corporate Settings surface — bottom sheet on mobile, centered card on desktop.
 * No balance / address / funding (those live on Portfolio).
 */
export function AccountSheet({ open, onClose, ...panelProps }: AccountSheetProps) {
  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Settings"
      title="Settings"
      subtitle="Manage appearance and account preferences."
      zIndex={100}
      panelClassName="wallet-account-sheet__panel max-h-[min(80dvh,32rem)] sm:max-w-md"
      bodyClassName="wallet-account-sheet__body"
      dragEntirePanel={false}
    >
      <WalletAccountPanel {...panelProps} onClose={onClose} />
    </AppBottomSheet>
  );
}

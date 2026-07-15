"use client";

import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { WalletAccountPanel, type WalletAccountPanelProps } from "@/components/wallet/WalletAccountPanel";

type AccountSheetProps = Omit<WalletAccountPanelProps, "variant"> & {
  open: boolean;
};

export function AccountSheet({ open, onClose, ...panelProps }: AccountSheetProps) {
  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Account"
      title="Account"
      zIndex={100}
      panelClassName="max-h-[min(85dvh,520px)] lg:hidden"
      bodyClassName="!p-0"
      dragEntirePanel={false}
    >
      <WalletAccountPanel {...panelProps} onClose={onClose} variant="sheet" />
    </AppBottomSheet>
  );
}

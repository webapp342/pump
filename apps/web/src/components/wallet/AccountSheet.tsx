"use client";

import { useEffect } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { useMobileModalClose } from "@/hooks/useMobileModalScrollLock";
import { WalletAccountPanel, type WalletAccountPanelProps } from "@/components/wallet/WalletAccountPanel";

type AccountSheetProps = Omit<WalletAccountPanelProps, "variant"> & {
  open: boolean;
};

export function AccountSheet({ open, onClose, ...panelProps }: AccountSheetProps) {
  const handleClose = useMobileModalClose(onClose);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss z-[100] cursor-default transition-opacity"
          aria-label="Close account"
          onClick={handleClose}
        />
        <div
          className="modal-sheet-host z-[101] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Account"
        >
          <div className="modal-panel modal-sheet-panel app-account-sheet pointer-events-auto max-h-[min(88dvh,560px)] overflow-hidden border-x-0 border-b-0 rounded-t-2xl">
            <div className="app-account-sheet__grab" aria-hidden />
            <div className="app-account-sheet__header">
              <h2 className="app-account-sheet__title">Account</h2>
              <button
                type="button"
                onClick={handleClose}
                className="app-account-sheet__close"
                aria-label="Close"
              >
                <span aria-hidden>×</span>
              </button>
            </div>
            <div className="app-account-sheet__body">
              <WalletAccountPanel {...panelProps} onClose={handleClose} variant="sheet" />
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}

"use client";

import { useEffect } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { useMobileModalClose, useMobileModalScrollLock } from "@/hooks/useMobileModalScrollLock";
import { WalletAccountPanel, type WalletAccountPanelProps } from "@/components/wallet/WalletAccountPanel";
import { PumpIcon, faX } from "@/lib/icons";

type AccountSheetProps = Omit<WalletAccountPanelProps, "variant"> & {
  open: boolean;
};

export function AccountSheet({ open, onClose, ...panelProps }: AccountSheetProps) {
  const handleClose = useMobileModalClose(onClose);
  useMobileModalScrollLock(open);

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
          <div className="modal-panel modal-sheet-panel app-sheet-host-panel pointer-events-auto max-h-[min(85dvh,520px)] overflow-hidden border-x-0 border-b-0 rounded-t-2xl">
            <div className="app-sheet app-sheet--account">
              <div className="app-sheet__grab" aria-hidden />
              <div className="app-sheet__header">
                <h2 className="app-sheet__title">Account</h2>
                <button type="button" onClick={handleClose} className="app-sheet__close" aria-label="Close">
                  <PumpIcon icon={faX} className="h-4 w-4" />
                </button>
              </div>
              <div className="app-sheet__body">
                <WalletAccountPanel {...panelProps} onClose={handleClose} variant="sheet" />
              </div>
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}

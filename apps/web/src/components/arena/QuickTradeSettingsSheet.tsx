"use client";

import { useEffect } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { useMobileModalClose } from "@/hooks/useMobileModalScrollLock";
import { useMobileSheetDragDismiss } from "@/hooks/useMobileSheetDragDismiss";

type QuickTradeSettingsSheetProps = {
  open: boolean;
  draftBuy: string;
  draftSellPct: string;
  onBuyChange: (value: string) => void;
  onSellPctChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function QuickTradeSettingsSheet({
  open,
  draftBuy,
  draftSellPct,
  onBuyChange,
  onSellPctChange,
  onClose,
  onSave,
}: QuickTradeSettingsSheetProps) {
  const handleClose = useMobileModalClose(onClose);
  const { panelRef, resetDrag } = useMobileSheetDragDismiss(handleClose);

  useEffect(() => {
    if (open) return;
    resetDrag();
  }, [open, resetDrag]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss z-[120] cursor-default"
          aria-label="Close quick trade settings"
          onClick={handleClose}
        />
        <div className="modal-sheet-host z-[121] items-center p-4" role="presentation">
          <div
            ref={panelRef}
            className="modal-panel modal-sheet-panel max-w-md w-full rounded-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Quick trade amounts"
          >
            <h2 className="text-body-sm font-semibold text-pump-text">Quick trade amounts</h2>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="field-label">Buy amount (USD)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draftBuy}
                  onChange={(event) => onBuyChange(event.target.value)}
                  className="field-input h-10 w-full text-body-sm"
                  placeholder="3"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="field-label">Sell (% of balance)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={draftSellPct}
                  onChange={(event) => onSellPctChange(event.target.value)}
                  className="field-input h-10 w-full text-body-sm"
                  placeholder="50"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={handleClose} className="secondary-button w-full">
                Cancel
              </button>
              <button type="button" onClick={onSave} className="primary-button w-full">
                Save
              </button>
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}

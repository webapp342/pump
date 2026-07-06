"use client";

import { useEffect, useState, type FocusEvent } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { useMobileModalClose } from "@/hooks/useMobileModalScrollLock";
import { useMobileSheetDragDismiss } from "@/hooks/useMobileSheetDragDismiss";
import { useVisualViewportSheetFrame } from "@/hooks/useVisualViewportSheetFrame";

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
  const { panelRef, sheetDragProps, resetDrag } = useMobileSheetDragDismiss(handleClose);
  const [inputFocused, setInputFocused] = useState(false);
  const sheetFrame = useVisualViewportSheetFrame(open && inputFocused);

  useEffect(() => {
    if (open) return;
    resetDrag();
    setInputFocused(false);
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

  const handleInputFocus = (_event: FocusEvent<HTMLInputElement>) => {
    setInputFocused(true);
  };

  const handleInputBlur = () => {
    // iOS reports null relatedTarget when the keyboard opens — defer the check.
    window.setTimeout(() => {
      const active = document.activeElement;
      if (panelRef.current?.contains(active)) return;
      setInputFocused(false);
    }, 0);
  };

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className={`modal-backdrop modal-backdrop-dismiss z-[120] cursor-default${
            sheetFrame.keyboardOpen ? " modal-backdrop--keyboard-open" : ""
          }`}
          aria-label="Close quick trade settings"
          onClick={handleClose}
        />
        <div
          className={`modal-sheet-host z-[121]${
            sheetFrame.useVisualViewport ? " modal-sheet-host--visual-viewport" : ""
          }`}
          style={sheetFrame.hostStyle}
          role="presentation"
        >
          <div
            ref={panelRef}
            className="modal-panel modal-sheet-panel max-w-md select-none rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:border-x sm:border-b sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Quick trade amounts"
            {...sheetDragProps}
          >
            <div
              className="trade-confirm-modal__grip mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-pump-border/45"
              aria-hidden
            />

            <h2 className="text-body-sm font-semibold text-pump-text">Quick trade amounts</h2>

            <div className="mt-4 space-y-3" data-sheet-drag-lock>
              <label className="block space-y-1.5">
                <span className="field-label">Buy amount (USD)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draftBuy}
                  onChange={(event) => onBuyChange(event.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
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
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  className="field-input h-10 w-full text-body-sm"
                  placeholder="50"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2" data-sheet-drag-lock>
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

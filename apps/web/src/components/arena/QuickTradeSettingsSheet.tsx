"use client";

import { useEffect, useState, type FocusEvent } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import {
  useMobileModalClose,
  useMobileModalScrollLock,
} from "@/hooks/useMobileModalScrollLock";
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

  useMobileModalScrollLock(open);

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

  const handlePanelFocusIn = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      setInputFocused(true);
    }
  };

  const handlePanelFocusOut = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && panelRef.current?.contains(next)) return;
    setInputFocused(false);
  };

  const handleInputFocus = (event: FocusEvent<HTMLInputElement>) => {
    setInputFocused(true);
    requestAnimationFrame(() => {
      event.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
    });
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
            onFocusCapture={handlePanelFocusIn}
            onBlurCapture={handlePanelFocusOut}
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

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  releaseMobileViewportAfterKeyboard,
  settleMobileViewportAfterSheetClose,
  useMobileModalClose,
  useMobileModalScrollLock,
  usePinMobileWindowScrollWhile,
} from "@/hooks/useMobileModalScrollLock";
import { useVisualViewportSheetFrame } from "@/hooks/useVisualViewportSheetFrame";
import { PumpIcon, faX } from "@/lib/icons";
import { TokenMarketSidebar } from "@/components/token/TokenMarketSidebar";

type TokenMobileMarketSheetProps = {
  open: boolean;
  onClose: () => void;
  activeTokenAddress: string;
};

/** Overlay market picker — chart stays full height (no inline accordion). */
export function TokenMobileMarketSheet({
  open,
  onClose,
  activeTokenAddress,
}: TokenMobileMarketSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const wasOpenRef = useRef(false);
  const handleClose = useMobileModalClose(onClose);

  const handleTokenSelect = () => {
    const active = document.activeElement;
    const inputFocused = active instanceof HTMLInputElement;
    setSearchFocused(false);
    if (inputFocused) {
      active.blur();
    }
    onClose();
    if (inputFocused) {
      releaseMobileViewportAfterKeyboard();
      return;
    }
    settleMobileViewportAfterSheetClose();
  };
  const sheetFrame = useVisualViewportSheetFrame(open && searchFocused);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) return;
    setSearchFocused(false);
  }, [open]);

  useMobileModalScrollLock(open);
  usePinMobileWindowScrollWhile(open && searchFocused);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    settleMobileViewportAfterSheetClose();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        className={`modal-backdrop modal-backdrop-dismiss z-[100] cursor-default lg:hidden${
          searchFocused || sheetFrame.keyboardOpen ? " modal-backdrop--keyboard-open" : ""
        }`}
        aria-label="Close markets list"
        onClick={handleClose}
      />
      <div
        className={`modal-sheet-host z-[101] lg:hidden${
          sheetFrame.useVisualViewport ? " modal-sheet-host--visual-viewport" : ""
        }`}
        style={sheetFrame.hostStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Explore coins"
      >
        <div className="token-mobile-market-sheet token-mobile-market-sheet--full modal-panel modal-sheet-panel pointer-events-auto flex flex-col overflow-hidden border-x-0 border-b-0 rounded-t-2xl">
          <div className="shrink-0 border-b border-pump-border/32 px-4 pb-3 pt-2">
            <div className="mx-auto mb-3 h-1 w-9 bg-pump-border/45" aria-hidden />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-h3 font-semibold text-pump-text">Explore coins</h2>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
                aria-label="Close"
              >
                <PumpIcon icon={faX} className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="token-mobile-market-sheet__body min-h-0 flex-1 overflow-hidden">
            <TokenMarketSidebar
              id="token-mobile-market-sidebar"
              activeTokenAddress={activeTokenAddress}
              density="compact"
              onTokenSelect={handleTokenSelect}
              onSearchFocusChange={setSearchFocused}
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

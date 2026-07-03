"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  releaseMobileViewportAfterKeyboard,
  settleMobileViewportAfterSheetClose,
  useMobileModalClose,
  useMobileModalScrollLock,
} from "@/hooks/useMobileModalScrollLock";
import { useMobileSheetDragDismiss } from "@/hooks/useMobileSheetDragDismiss";
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleClose = useMobileModalClose(onClose);
  const { panelRef, gripProps, resetDrag } = useMobileSheetDragDismiss(handleClose);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) return;
    setSearchFocused(false);
    resetDrag();
  }, [open, resetDrag]);

  useMobileModalScrollLock(open);

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

  useEffect(() => {
    if (!open) return;
    const shell = document.querySelector(".app-shell");
    shell?.setAttribute("inert", "");
    return () => shell?.removeAttribute("inert");
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="modal-backdrop modal-backdrop-dismiss z-[100] cursor-default lg:hidden"
        aria-label="Close markets list"
        onClick={handleClose}
      />
      <div
        className="modal-sheet-host z-[101] lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Token markets"
      >
        <div
          ref={panelRef}
          className="token-mobile-market-sheet token-mobile-market-sheet--full modal-panel modal-sheet-panel pointer-events-auto flex flex-col overflow-hidden border-x-0 border-b-0 rounded-t-2xl"
        >
          <div
            className="token-mobile-market-sheet__grip shrink-0 touch-none select-none px-4 pb-1 pt-2"
            {...gripProps}
          >
            <div className="mx-auto h-1 w-9 rounded-full bg-pump-border/45" aria-hidden />
          </div>
          <div className="token-mobile-market-sheet__body min-h-0 flex-1 overflow-hidden">
            <TokenMarketSidebar
              id="token-mobile-market-sidebar"
              activeTokenAddress={activeTokenAddress}
              density="compact"
              mobileSheet
              showQuickTrade
              onTokenSelect={handleTokenSelect}
              onSearchFocusChange={setSearchFocused}
              searchActive={searchFocused}
              searchInputRef={searchInputRef}
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

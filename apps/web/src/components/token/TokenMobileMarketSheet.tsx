"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  pinMobileWindowScroll,
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleClose = useMobileModalClose(onClose);

  const handleSearchDismiss = useCallback(() => {
    searchInputRef.current?.blur();
    setSearchFocused(false);
    releaseMobileViewportAfterKeyboard();
  }, []);

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

  useEffect(() => {
    if (!open || !searchFocused) return;
    pinMobileWindowScroll();
    requestAnimationFrame(() => {
      pinMobileWindowScroll();
      searchInputRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }, [open, searchFocused]);

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
        <div
          className={`token-mobile-market-sheet token-mobile-market-sheet--full modal-panel modal-sheet-panel pointer-events-auto flex flex-col overflow-hidden border-x-0 border-b-0 rounded-t-2xl${
            searchFocused ? " token-mobile-market-sheet--search-active" : ""
          }`}
        >
          {searchFocused ? (
            <div className="token-mobile-market-sheet__search-grip shrink-0 px-4 pb-1 pt-2">
              <div className="mx-auto h-1 w-9 rounded-full bg-pump-border/45" aria-hidden />
            </div>
          ) : (
            <div className="token-mobile-market-sheet__header shrink-0 px-4 pb-2 pt-2">
              <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-pump-border/45" aria-hidden />
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-h3 font-semibold tracking-tight text-pump-text">Explore coins</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
                  aria-label="Close"
                >
                  <PumpIcon icon={faX} className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
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
              onSearchDismiss={handleSearchDismiss}
              searchInputRef={searchInputRef}
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

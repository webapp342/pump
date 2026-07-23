"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  releaseMobileViewportAfterKeyboard,
  settleMobileViewportAfterSheetClose,
  useMobileModalClose,
  useMobileModalScrollLock,
} from "@/hooks/useMobileModalScrollLock";
import { useMobileSheetDragDismiss } from "@/hooks/useMobileSheetDragDismiss";
import { useArenaQuickTrade } from "@/hooks/useArenaQuickTrade";
import { TokenMarketSidebar } from "@/components/token/TokenMarketSidebar";
import { PumpIcon, faList, faX } from "@/lib/icons";

type TokenMobileMarketSheetProps = {
  open: boolean;
  onClose: () => void;
  activeTokenAddress: string;
  activeMarketSnapshot?: {
    spotPriceBnb: number;
    marketCapBnb: number;
    volume24hBnb?: number;
    tradeCount?: number;
  };
};

/** Overlay market picker — chart stays full height (no inline accordion). */
export function TokenMobileMarketSheet({
  open,
  onClose,
  activeTokenAddress,
  activeMarketSnapshot,
}: TokenMobileMarketSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const wasOpenRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleClose = useMobileModalClose(onClose);
  const { panelRef, gripProps, resetDrag } = useMobileSheetDragDismiss(handleClose);
  const { openQuickTrade, quickTradeSheet, hasQuickTrade } = useArenaQuickTrade();

  const handleOpenQuickTrade = useCallback(
    (tokenAddress: string, symbol: string, side: "buy" | "sell") => {
      openQuickTrade(tokenAddress, symbol, side);
      handleClose();
    },
    [openQuickTrade, handleClose]
  );

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

  if (!mounted) return null;
  if (!open && !hasQuickTrade) return null;

  const showExploreSheet = open;

  return createPortal(
    <>
      {showExploreSheet ? (
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
            aria-labelledby="token-mobile-market-sheet-title"
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
              <div className="token-mobile-market-sheet__header toolbar-sheet-header shrink-0">
                <div className="toolbar-sheet-header__title">
                  <span className="toolbar-sheet-header__icon" aria-hidden>
                    <PumpIcon icon={faList} className="h-4 w-4 text-pump-accent" />
                  </span>
                  <h2 id="token-mobile-market-sheet-title" className="toolbar-sheet-header__label">
                    Explore coins
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="toolbar-sheet-header__close"
                  aria-label="Close"
                >
                  <PumpIcon icon={faX} className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="token-mobile-market-sheet__body min-h-0 flex-1 overflow-hidden">
                <TokenMarketSidebar
                  id="token-mobile-market-sidebar"
                  activeTokenAddress={activeTokenAddress}
                  activeMarketSnapshot={activeMarketSnapshot}
                  density="compact"
                  mobileSheet
                  showQuickTrade
                  onTokenSelect={handleTokenSelect}
                  onSearchFocusChange={setSearchFocused}
                  searchActive={searchFocused}
                  searchInputRef={searchInputRef}
                  onOpenQuickTrade={handleOpenQuickTrade}
                  renderQuickTradeSheet={false}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}
      {hasQuickTrade ? quickTradeSheet : null}
    </>,
    document.body
  );
}

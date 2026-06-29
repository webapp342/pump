"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="modal-backdrop modal-backdrop-dismiss z-[100] cursor-default lg:hidden"
        aria-label="Close markets list"
        onClick={onClose}
      />
      <div
        className="modal-sheet-host z-[101] lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Explore coins"
      >
        <div className="token-mobile-market-sheet modal-panel modal-sheet-panel pointer-events-auto flex max-h-[min(85dvh,640px)] flex-col overflow-hidden border-x-0 border-b-0 rounded-t-2xl">
          <div className="shrink-0 border-b border-pump-border/32 px-4 pb-3 pt-2">
            <div className="mx-auto mb-3 h-1 w-9 bg-pump-border/45" aria-hidden />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-h3 font-semibold text-pump-text">Explore coins</h2>
              <button
                type="button"
                onClick={onClose}
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
              onTokenSelect={onClose}
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

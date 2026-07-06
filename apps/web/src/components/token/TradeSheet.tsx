"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  useMobileModalClose,
  useMobileModalScrollLock,
} from "@/hooks/useMobileModalScrollLock";
import { useMobileSheetDragDismiss } from "@/hooks/useMobileSheetDragDismiss";
import { useVisualViewportSheetFrame } from "@/hooks/useVisualViewportSheetFrame";
import { TradePanel, type TradeConfirmedPayload, type TradeOptimisticPayload, type TradeSubmittedPayload } from "@/components/token/TradePanel";
import type { TradePrefillConfig } from "@/lib/token-trade-prefill";
import type { BondingCurveSnapshot } from "@/lib/bonding-curve";

type TradeSheetProps = {
  open: boolean;
  onClose: () => void;
  tokenAddress: `0x${string}`;
  symbol: string;
  status: string;
  reserveBnb?: string;
  tokenSold?: string;
  prefill?: TradePrefillConfig | null;
  onTradeOptimistic?: (payload: TradeOptimisticPayload) => void;
  onTradeOptimisticRollback?: (payload: { pendingId: string }) => void;
  onTradeSubmitted?: (payload: TradeSubmittedPayload) => void;
  onTradeConfirmed?: (payload: TradeConfirmedPayload) => void;
  chainCurveSnapshot?: BondingCurveSnapshot;
  /** 24h price change for mobile Quick Order header. */
  changePct?: number | null;
  /** Live spot for mobile Quick Order header. */
  priceUsd?: number | null;
  /** Token logo for mobile Quick Order header. */
  logoUrl?: string | null;
  /** Opens explore-coins sheet from trade header. */
  onOpenMarket?: () => void;
  /** Bottom sheet on mobile token page; centered modal for portfolio quick actions. */
  presentation?: "sheet" | "modal";
  /** Save token-page dock buy/sell prefs when the mobile sheet closes. */
  persistTokenMobileTradePrefs?: boolean;
};

export function TradeSheet({
  open,
  onClose,
  tokenAddress,
  symbol,
  status,
  reserveBnb,
  tokenSold = "0",
  prefill = null,
  onTradeOptimistic,
  onTradeOptimisticRollback,
  onTradeSubmitted,
  onTradeConfirmed,
  chainCurveSnapshot,
  changePct = null,
  priceUsd = null,
  logoUrl = null,
  onOpenMarket,
  presentation = "sheet",
  persistTokenMobileTradePrefs = false,
}: TradeSheetProps) {
  const [mounted, setMounted] = useState(false);
  const isModal = presentation === "modal";
  const handleClose = useMobileModalClose(onClose);
  const sheetFrame = useVisualViewportSheetFrame(false);
  const { panelRef, sheetDragProps, resetDrag } = useMobileSheetDragDismiss(handleClose);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) return;
    resetDrag();
  }, [open, resetDrag]);

  useMobileModalScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  if (!open || !mounted) return null;

  const tradeSide = prefill?.side ?? "buy";
  const tradeTitle = tradeSide === "sell" ? `Sell $${symbol}` : `Buy $${symbol}`;

  return createPortal(
    <>
      <button
        type="button"
        className={`modal-backdrop modal-backdrop-dismiss z-[100] cursor-default transition-opacity ${
          isModal ? "" : "lg:hidden"
        }${sheetFrame.keyboardOpen ? " modal-backdrop--keyboard-open" : ""}`}
        aria-label="Close trade panel"
        onClick={handleClose}
      />
      <div
        className={`modal-sheet-host z-[101] ${isModal ? "items-center p-4" : "lg:hidden"}${
          sheetFrame.useVisualViewport ? " modal-sheet-host--visual-viewport" : ""
        }`}
        style={sheetFrame.hostStyle}
        role="dialog"
        aria-modal="true"
        aria-label={isModal ? tradeTitle : `Trade ${symbol}`}
      >
        <div
          ref={panelRef}
          className={`trade-sheet modal-panel modal-sheet-panel pointer-events-auto flex flex-col overflow-hidden ${
            isModal
              ? "max-w-md max-h-[min(85dvh,640px)]"
              : "trade-sheet--mobile max-h-full select-none border-x-0 border-b-0 rounded-t-2xl"
          }`}
          {...(!isModal ? sheetDragProps : undefined)}
        >
          {!isModal ? (
            <div className="trade-sheet__grip-bar shrink-0" aria-hidden>
              <div className="trade-sheet__grip" />
            </div>
          ) : null}
          {isModal ? (
            <div className="shrink-0 border-b border-pump-border/45 px-4 pb-3 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-h3 font-semibold text-pump-text">{tradeTitle}</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
                  aria-label="Close"
                >
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TradePanel
              key={`${tokenAddress}-${tradeSide}`}
              embedded
              compact={!isModal}
              tokenAddress={tokenAddress}
              symbol={symbol}
              status={status}
              reserveBnb={reserveBnb}
              tokenSold={tokenSold}
              prefill={prefill}
              onTradeOptimistic={onTradeOptimistic}
              onTradeOptimisticRollback={onTradeOptimisticRollback}
              onTradeSubmitted={onTradeSubmitted}
              onTradeConfirmed={onTradeConfirmed}
              chainCurveSnapshot={chainCurveSnapshot}
              changePct={changePct}
              priceUsd={priceUsd}
              logoUrl={logoUrl}
              onOpenMarket={onOpenMarket}
              sheetOnClose={isModal ? undefined : handleClose}
              persistTokenMobileTradePrefs={persistTokenMobileTradePrefs}
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

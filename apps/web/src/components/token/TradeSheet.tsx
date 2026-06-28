"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  /** Bottom sheet on mobile token page; centered modal for portfolio quick actions. */
  presentation?: "sheet" | "modal";
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
  presentation = "sheet",
}: TradeSheetProps) {
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

  const isModal = presentation === "modal";
  const tradeSide = prefill?.side ?? "buy";
  const tradeTitle = tradeSide === "sell" ? `Sell $${symbol}` : `Buy $${symbol}`;

  return createPortal(
    <>
      <button
        type="button"
        className={`modal-backdrop modal-backdrop-dismiss z-[100] cursor-default transition-opacity ${isModal ? "" : "lg:hidden"}`}
        aria-label="Close trade panel"
        onClick={onClose}
      />
      <div
        className={`modal-sheet-host z-[101] ${isModal ? "items-center p-4" : "lg:hidden"}`}
        role="dialog"
        aria-modal="true"
        aria-label={isModal ? tradeTitle : `Trade ${symbol}`}
      >
        <div
          className={`modal-panel modal-sheet-panel pointer-events-auto flex flex-col overflow-hidden ${
            isModal
              ? "max-w-md max-h-[min(85dvh,640px)]"
              : "max-h-[min(85dvh,720px)] border-x-0 border-b-0 rounded-t-2xl"
          }`}
        >
          {isModal ? (
            <div className="shrink-0 border-b border-pump-border/45 px-4 pb-3 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-h3 font-semibold text-pump-text">{tradeTitle}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
                  aria-label="Close"
                >
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="shrink-0 pt-2" aria-hidden>
              <div className="mx-auto h-1 w-9 bg-pump-border/45" />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
            <TradePanel
              key={`${tokenAddress}-${tradeSide}`}
              embedded
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
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

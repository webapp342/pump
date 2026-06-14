"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TradePanel, type TradeConfirmedPayload } from "@/components/token/TradePanel";
import type { TradePrefillConfig } from "@/lib/token-trade-prefill";
import type { BondingCurveSnapshot } from "@/lib/bonding-curve";

type TradeSheetProps = {
  open: boolean;
  onClose: () => void;
  tokenAddress: `0x${string}`;
  symbol: string;
  status: string;
  reserveBnb?: string;
  prefill?: TradePrefillConfig | null;
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
  prefill = null,
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
        className={`modal-backdrop modal-backdrop-dismiss z-[100] cursor-default transition-opacity ${isModal ? "" : "xl:hidden"}`}
        aria-label="Close trade panel"
        onClick={onClose}
      />
      <div
        className={`fixed inset-0 z-[101] flex pointer-events-none ${
          isModal ? "items-center justify-center p-4" : "items-end justify-center xl:hidden"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={`Trade ${symbol}`}
      >
        <div
          className={`modal-panel pointer-events-auto flex flex-col overflow-hidden ${
            isModal
              ? "w-full max-w-md max-h-[min(85dvh,640px)]"
              : "w-full max-h-[min(85dvh,720px)] border-x-0 border-b-0"
          }`}
        >
          <div className={`shrink-0 border-b border-pump-border/45 px-4 pb-3 ${isModal ? "pt-4" : "pt-2"}`}>
            {!isModal ? (
              <div className="mb-2 flex justify-center" aria-hidden>
                <div className="h-1 w-9 bg-pump-border/45" />
              </div>
            ) : null}
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
            <TradePanel
              embedded
              tokenAddress={tokenAddress}
              symbol={symbol}
              status={status}
              reserveBnb={reserveBnb}
              prefill={prefill}
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

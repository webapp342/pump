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

  return createPortal(
    <>
      <button
        type="button"
        className="modal-backdrop modal-backdrop-dismiss z-[100] cursor-default transition-opacity xl:hidden"
        aria-label="Close trade panel"
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-[101] flex items-end justify-center pointer-events-none xl:hidden"
        role="dialog"
        aria-modal="true"
        aria-label={`Trade ${symbol}`}
      >
        <div className="modal-panel pointer-events-auto flex w-full max-h-[min(85dvh,720px)] flex-col overflow-hidden border-x-0 border-b-0">
          <div className="shrink-0 border-b border-pump-border/45 px-4 pb-3 pt-2">
            <div className="mb-2 flex justify-center" aria-hidden>
              <div className="h-1 w-9 bg-pump-border/45" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-h3 font-semibold text-pump-text">Trade ${symbol}</h2>
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

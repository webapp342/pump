"use client";

import { useEffect, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { NativeLogo } from "@/components/token/NativeLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { formatUsdReadable } from "@/lib/format-usd";
import {
  useMobileModalClose,
  useMobileModalScrollLock,
} from "@/hooks/useMobileModalScrollLock";
import { useMobileSheetDragDismiss } from "@/hooks/useMobileSheetDragDismiss";

export type TradeConfirmAssetLine = {
  amount: string;
  symbol: string;
  asset: "native" | "token";
  tokenAddress?: `0x${string}`;
  usd: number | null;
};

type TradeConfirmModalProps = {
  open: boolean;
  side: "buy" | "sell";
  spend: TradeConfirmAssetLine;
  receive: TradeConfirmAssetLine;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (rememberSession: boolean) => void;
};

function TradeConfirmAssetValue({ line }: { line: TradeConfirmAssetLine }) {
  return (
    <div className="trade-confirm-row__value">
      <div className="trade-confirm-row__asset">
        {line.asset === "native" ? (
          <NativeLogo size={18} className="trade-confirm-row__logo" />
        ) : (
          <TokenAvatar
            address={line.tokenAddress ?? "0x0000000000000000000000000000000000000000"}
            symbol={line.symbol}
            size={18}
            className="trade-confirm-row__logo shrink-0"
          />
        )}
        <span className="financial-value text-body-sm font-semibold text-pump-text">
          {line.amount} {line.symbol}
        </span>
      </div>
      <span className="trade-confirm-row__usd financial-value text-caption text-pump-muted">
        {line.usd != null ? formatUsdReadable(line.usd, { compact: true }) : "—"}
      </span>
    </div>
  );
}

export function TradeConfirmModal({
  open,
  side,
  spend,
  receive,
  loading,
  error,
  onClose,
  onConfirm,
}: TradeConfirmModalProps) {
  const [remember, setRemember] = useState(true);
  const handleClose = useMobileModalClose(onClose);
  const { panelRef, sheetDragProps, resetDrag } = useMobileSheetDragDismiss(handleClose);

  useMobileModalScrollLock(open);

  useEffect(() => {
    if (open) return;
    resetDrag();
  }, [open, resetDrag]);

  if (!open) return null;

  const actionLabel = side === "buy" ? "Buy" : "Sell";

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss z-[120] cursor-default"
          aria-label="Close"
          onClick={handleClose}
        />
        <div className="modal-sheet-host z-[121]" role="presentation">
          <div
            ref={panelRef}
            className="trade-confirm-modal modal-panel modal-sheet-panel max-w-md select-none rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:border-x sm:border-b sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label={`Confirm ${actionLabel.toLowerCase()} order`}
            {...sheetDragProps}
          >
            <div
              className="trade-confirm-modal__grip mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-pump-border/45"
              aria-hidden
            />

            <dl className="space-y-3">
              <div className="trade-confirm-row">
                <dt className="trade-confirm-row__label text-caption text-pump-muted">You pay</dt>
                <dd className="trade-confirm-row__content">
                  <TradeConfirmAssetValue line={spend} />
                </dd>
              </div>
              <div className="trade-confirm-row">
                <dt className="trade-confirm-row__label text-caption text-pump-muted">You receive</dt>
                <dd className="trade-confirm-row__content">
                  <TradeConfirmAssetValue line={receive} />
                </dd>
              </div>
            </dl>

            {error ? <p className="notice-warning mt-3 leading-snug">{error}</p> : null}

            <label
              className="mt-4 flex cursor-pointer items-center gap-2 text-caption text-pump-muted"
              data-sheet-drag-lock
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 shrink-0"
              />
              Don&apos;t ask again
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2" data-sheet-drag-lock>
              <button
                type="button"
                onClick={handleClose}
                className="secondary-button w-full"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirm(remember)}
                className="primary-button w-full"
                disabled={loading}
              >
                {loading ? "Confirming…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}

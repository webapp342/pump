"use client";

import { useState } from "react";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { NativeLogo } from "@/components/token/NativeLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { formatUsdReadable } from "@/lib/format-usd";

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
          <NativeLogo size="sm" className="trade-confirm-row__logo" />
        ) : (
          <TokenAvatar
            address={line.tokenAddress ?? "0x0000000000000000000000000000000000000000"}
            symbol={line.symbol}
            size="sm"
            shape="rounded"
            className="trade-confirm-row__logo shrink-0"
          />
        )}
        <span className="trade-confirm-row__amount financial-value">
          {line.amount} {line.symbol}
        </span>
      </div>
      <span className="trade-confirm-row__usd financial-value">
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
  const actionLabel = side === "buy" ? "Buy" : "Sell";
  const title = `Confirm ${actionLabel.toLowerCase()}`;

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={title}
      title={title}
      zIndex={120}
      panelClassName="trade-confirm-modal max-w-md"
      bodyClassName="trade-confirm-modal__body"
      footer={
        <div className="trade-confirm-modal__footer">
          <button
            type="button"
            onClick={onClose}
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
      }
    >
      <dl className="trade-confirm-modal__summary">
        <div className="trade-confirm-row">
          <dt className="trade-confirm-row__label">You pay</dt>
          <dd className="trade-confirm-row__content">
            <TradeConfirmAssetValue line={spend} />
          </dd>
        </div>
        <div className="trade-confirm-row">
          <dt className="trade-confirm-row__label">You receive</dt>
          <dd className="trade-confirm-row__content">
            <TradeConfirmAssetValue line={receive} />
          </dd>
        </div>
      </dl>

      {error ? <p className="trade-confirm-modal__error notice-warning leading-snug">{error}</p> : null}

      <label className="trade-confirm-modal__remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="trade-confirm-modal__checkbox"
        />
        <span>Don&apos;t ask again</span>
      </label>
    </AppBottomSheet>
  );
}

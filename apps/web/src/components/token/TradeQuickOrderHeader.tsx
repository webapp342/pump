"use client";

import { TokenAvatar } from "@/components/token/TokenAvatar";
import { PumpIcon, faList } from "@/lib/icons";

type TradeQuickOrderSide = "buy" | "sell";

type TradeQuickOrderHeaderProps = {
  tokenAddress: string;
  symbol: string;
  logoUrl?: string | null;
  changePct?: number | null;
  side: TradeQuickOrderSide;
  onSideChange: (side: TradeQuickOrderSide) => void;
  onClose: () => void;
  onOpenMarket?: () => void;
};

function formatChangePct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct >= 0 && pct !== 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function changeBadgeClass(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct) || pct === 0) {
    return "trade-quick-order-header__change";
  }
  return pct > 0
    ? "trade-quick-order-header__change trade-quick-order-header__change--up"
    : "trade-quick-order-header__change trade-quick-order-header__change--down";
}

export function TradeQuickOrderHeader({
  tokenAddress,
  symbol,
  logoUrl = null,
  changePct = null,
  side,
  onSideChange,
  onClose,
  onOpenMarket,
}: TradeQuickOrderHeaderProps) {
  return (
    <header className="trade-quick-order-header">
      <div className="trade-quick-order-header__top">
        <h2 className="trade-quick-order-header__title">Quick Order</h2>
        <button
          type="button"
          onClick={onClose}
          className="trade-quick-order-header__close"
          aria-label="Close"
        >
          <span aria-hidden>×</span>
        </button>
      </div>

      <div className="trade-quick-order-header__meta">
        <div className="trade-quick-order-header__pair-row">
          {onOpenMarket ? (
            <button
              type="button"
              className="trade-quick-order-header__list-btn"
              onClick={onOpenMarket}
              aria-label="Explore coins"
            >
              <PumpIcon icon={faList} className="h-4 w-4" />
            </button>
          ) : null}
          <TokenAvatar
            address={tokenAddress}
            symbol={symbol}
            logoUrl={logoUrl}
            size={26}
            className="trade-quick-order-header__logo !ring-0"
          />
          <span className="trade-quick-order-header__pair financial-value">{symbol}/USD</span>
          <span className={changeBadgeClass(changePct)}>{formatChangePct(changePct)}</span>
        </div>

        <div className="trade-quick-order-header__side-toggle" role="tablist" aria-label="Trade side">
          <button
            type="button"
            role="tab"
            aria-selected={side === "buy"}
            className={
              side === "buy"
                ? "trade-quick-order-header__side-btn trade-quick-order-header__side-btn--buy-active"
                : "trade-quick-order-header__side-btn"
            }
            onClick={() => onSideChange("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={side === "sell"}
            className={
              side === "sell"
                ? "trade-quick-order-header__side-btn trade-quick-order-header__side-btn--sell-active"
                : "trade-quick-order-header__side-btn"
            }
            onClick={() => onSideChange("sell")}
          >
            Sell
          </button>
        </div>
      </div>
    </header>
  );
}

"use client";

import { TokenAvatar } from "@/components/token/TokenAvatar";

type TradeQuickOrderSide = "buy" | "sell";

type TradeQuickOrderHeaderProps = {
  tokenAddress: string;
  symbol: string;
  logoUrl?: string | null;
  changePct?: number | null;
  side: TradeQuickOrderSide;
  onSideChange: (side: TradeQuickOrderSide) => void;
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
}: TradeQuickOrderHeaderProps) {
  return (
    <header className="trade-quick-order-header">
      <div className="trade-quick-order-header__row">
        <div className="trade-quick-order-header__token">
          <TokenAvatar
            address={tokenAddress}
            symbol={symbol}
            logoUrl={logoUrl}
            size="md"
            className="trade-quick-order-header__logo !ring-0"
          />
          <div className="trade-quick-order-header__token-meta min-w-0">
            <span className="trade-quick-order-header__symbol financial-value">{symbol}</span>
            <span className={changeBadgeClass(changePct)}>{formatChangePct(changePct)}</span>
          </div>
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

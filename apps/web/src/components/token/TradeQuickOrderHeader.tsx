"use client";

import { TokenAvatar } from "@/components/token/TokenAvatar";
import { PumpSubscriptPrice } from "@/components/ui/PumpSubscriptPrice";
import { PumpIcon, faList, faX } from "@/lib/icons";

type TradeQuickOrderSide = "buy" | "sell";

type TradeQuickOrderHeaderProps = {
  tokenAddress: string;
  symbol: string;
  logoUrl?: string | null;
  priceUsd?: number | null;
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

function InstrumentPrice({ priceUsd }: { priceUsd: number | null | undefined }) {
  if (priceUsd == null || !Number.isFinite(priceUsd)) {
    return <span className="trade-quick-order-header__price financial-value">—</span>;
  }

  if (priceUsd >= 1) {
    return (
      <span className="trade-quick-order-header__price financial-value">
        $
        {priceUsd.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    );
  }

  return <PumpSubscriptPrice value={priceUsd} className="trade-quick-order-header__price financial-value" />;
}

export function TradeQuickOrderHeader({
  tokenAddress,
  symbol,
  logoUrl = null,
  priceUsd = null,
  changePct = null,
  side,
  onSideChange,
  onClose,
  onOpenMarket,
}: TradeQuickOrderHeaderProps) {
  return (
    <header className="trade-quick-order-header">
      <div className="trade-quick-order-header__grip" aria-hidden />

      <div className="trade-quick-order-header__title-row">
        <h2 className="trade-quick-order-header__title">Quick Order</h2>
        <button
          type="button"
          onClick={onClose}
          className="trade-quick-order-header__close"
          aria-label="Close"
        >
          <PumpIcon icon={faX} className="h-4 w-4" aria-hidden />
        </button>
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

      <div className="trade-quick-order-header__instrument">
        <div className="trade-quick-order-header__instrument-lead">
          {onOpenMarket ? (
            <button
              type="button"
              className="trade-quick-order-header__list-btn"
              onClick={onOpenMarket}
              aria-label="Explore coins"
            >
              <PumpIcon icon={faList} className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <TokenAvatar
            address={tokenAddress}
            symbol={symbol}
            logoUrl={logoUrl}
            size={28}
            className="trade-quick-order-header__logo !ring-0"
          />
          <div className="trade-quick-order-header__instrument-copy min-w-0">
            <span className="trade-quick-order-header__pair financial-value">{symbol}/USD</span>
            <span className={changeBadgeClass(changePct)}>{formatChangePct(changePct)}</span>
          </div>
        </div>
        <div className="trade-quick-order-header__quote">
          <span className="trade-quick-order-header__quote-label">Last</span>
          <InstrumentPrice priceUsd={priceUsd} />
        </div>
      </div>
    </header>
  );
}

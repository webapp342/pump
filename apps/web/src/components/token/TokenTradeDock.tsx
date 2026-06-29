"use client";

type TokenTradeDockProps = {
  symbol: string;
  disabled?: boolean;
  onBuy: () => void;
  onSell: () => void;
};

/** Mobile thumb-zone Buy | Sell — opens TradeSheet (corporate retail pattern). */
export function TokenTradeDock({ symbol, disabled = false, onBuy, onSell }: TokenTradeDockProps) {
  return (
    <div className="token-trade-dock lg:hidden" role="region" aria-label="Trade actions">
      <div className="token-trade-dock-inner px-3">
        <div className="token-trade-dock-actions">
          <button
            type="button"
            className="token-trade-dock-buy"
            disabled={disabled}
            onClick={onBuy}
          >
            Buy ${symbol}
          </button>
          <button
            type="button"
            className="token-trade-dock-sell"
            disabled={disabled}
            onClick={onSell}
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  );
}

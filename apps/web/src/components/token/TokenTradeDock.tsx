"use client";

type TokenTradeDockProps = {
  disabled?: boolean;
  onBuy: () => void;
  onSell: () => void;
};

/** Mobile trade dock — segment-control pattern (matches chart toggles), opens TradeSheet. */
export function TokenTradeDock({ disabled = false, onBuy, onSell }: TokenTradeDockProps) {
  return (
    <div className="token-trade-dock lg:hidden" role="region" aria-label="Trade actions">
      <div className="token-trade-dock-inner">
        <div className="token-trade-dock-actions segment-control">
          <button
            type="button"
            className="chip-button token-trade-dock-buy"
            disabled={disabled}
            onClick={onBuy}
          >
            Buy
          </button>
          <button
            type="button"
            className="chip-button token-trade-dock-sell"
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

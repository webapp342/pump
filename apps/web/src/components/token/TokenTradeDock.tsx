"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_TOKEN_MOBILE_TRADE,
  formatTokenMobileOrderValueUsd,
  readTokenMobileTradePrefs,
  TOKEN_MOBILE_TRADE_CHANGE_EVENT,
  type TokenMobileTradePrefs,
} from "@/lib/token-mobile-trade-prefs";

export type TokenTradeDockPillProps = {
  disabled?: boolean;
  pendingSide?: "buy" | "sell" | null;
  onBuy: () => void;
  onSell: () => void;
  onEditAmount: () => void;
  className?: string;
};

export function TokenTradeDockPill({
  disabled = false,
  pendingSide = null,
  onBuy,
  onSell,
  onEditAmount,
  className = "",
}: TokenTradeDockPillProps) {
  const [prefs, setPrefs] = useState<TokenMobileTradePrefs>(DEFAULT_TOKEN_MOBILE_TRADE);

  const syncPrefs = useCallback(() => {
    setPrefs(readTokenMobileTradePrefs());
  }, []);

  useEffect(() => {
    syncPrefs();
    const onChange = () => syncPrefs();
    window.addEventListener(TOKEN_MOBILE_TRADE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(TOKEN_MOBILE_TRADE_CHANGE_EVENT, onChange);
  }, [syncPrefs]);

  const buyPending = pendingSide === "buy";
  const sellPending = pendingSide === "sell";
  const orderValueLabel = formatTokenMobileOrderValueUsd(prefs.orderValueUsd);

  return (
    <div
      className={`token-trade-dock-pill${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Trade actions"
    >
      <button
        type="button"
        className={`token-trade-dock-pill__side token-trade-dock-pill__side--buy${
          buyPending ? " token-trade-dock-pill__side--pending" : ""
        }`}
        disabled={disabled || buyPending || sellPending}
        onClick={onBuy}
        aria-busy={buyPending}
      >
        Buy
      </button>

      <button
        type="button"
        className="token-trade-dock-pill__amount"
        disabled={disabled || buyPending || sellPending}
        onClick={onEditAmount}
        aria-label={`Edit order value, currently ${orderValueLabel}`}
      >
        <span className="token-trade-dock-pill__amount-value financial-value">
          {orderValueLabel}
        </span>
      </button>

      <button
        type="button"
        className={`token-trade-dock-pill__side token-trade-dock-pill__side--sell${
          sellPending ? " token-trade-dock-pill__side--pending" : ""
        }`}
        disabled={disabled || buyPending || sellPending}
        onClick={onSell}
        aria-busy={sellPending}
      >
        Sell
      </button>
    </div>
  );
}

type TokenTradeDockProps = TokenTradeDockPillProps & {
  /** Below chart on mobile — scrolls with page, sticks under chart while scrolling activity. */
  placement?: "fixed" | "inline";
};

/** Mobile trade dock — pill Buy | order value USD | Sell; center opens amount editor. */
export function TokenTradeDock({
  placement = "fixed",
  ...pillProps
}: TokenTradeDockProps) {
  return (
    <div
      className={`token-trade-dock lg:hidden${
        placement === "inline"
          ? " token-trade-dock--inline"
          : " token-trade-dock--footer"
      }`}
      role="region"
      aria-label="Trade actions"
    >
      <div className="token-trade-dock-inner">
        <TokenTradeDockPill {...pillProps} />
      </div>
    </div>
  );
}

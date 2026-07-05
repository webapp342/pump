"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_TOKEN_MOBILE_TRADE,
  formatTokenMobileOrderValueUsd,
  readTokenMobileTradePrefs,
  TOKEN_MOBILE_TRADE_CHANGE_EVENT,
  type TokenMobileTradePrefs,
} from "@/lib/token-mobile-trade-prefs";
import { PumpIcon, faChevronDown } from "@/lib/icons";

type TokenTradeDockProps = {
  disabled?: boolean;
  pendingSide?: "buy" | "sell" | null;
  onBuy: () => void;
  onSell: () => void;
  onEditAmount: () => void;
  /** Below chart on mobile — scrolls with page, sticks under chart while scrolling activity. */
  placement?: "fixed" | "inline";
};

/** Mobile trade dock — pill Buy | order value USD | Sell; center opens amount editor. */
export function TokenTradeDock({
  disabled = false,
  pendingSide = null,
  onBuy,
  onSell,
  onEditAmount,
  placement = "fixed",
}: TokenTradeDockProps) {
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
      className={`token-trade-dock lg:hidden${
        placement === "inline"
          ? " token-trade-dock--inline"
          : " token-trade-dock--footer"
      }`}
      role="region"
      aria-label="Trade actions"
    >
      <div className="token-trade-dock-inner">
        <div className="token-trade-dock-pill">
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
            <PumpIcon icon={faChevronDown} className="token-trade-dock-pill__amount-chevron" aria-hidden />
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
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { NATIVE_SYMBOL } from "@/config/chain";
import {
  ARENA_QUICK_TRADE_CHANGE_EVENT,
  DEFAULT_ARENA_QUICK_TRADE,
  readArenaQuickTradePrefs,
  type ArenaQuickTradePrefs,
} from "@/lib/arena-quick-trade";

type ArenaBoardRowQuickActionsProps = {
  onBuy: () => void;
  onSell: () => void;
  layout?: "inline" | "card" | "card-compact";
};

export function ArenaBoardRowQuickActions({
  onBuy,
  onSell,
  layout = "inline",
}: ArenaBoardRowQuickActionsProps) {
  const [prefs, setPrefs] = useState<ArenaQuickTradePrefs>(DEFAULT_ARENA_QUICK_TRADE);

  const syncPrefs = useCallback(() => {
    setPrefs(readArenaQuickTradePrefs());
  }, []);

  useEffect(() => {
    syncPrefs();
    const onChange = () => syncPrefs();
    window.addEventListener(ARENA_QUICK_TRADE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(ARENA_QUICK_TRADE_CHANGE_EVENT, onChange);
  }, [syncPrefs]);

  return (
    <div
      className={
        layout === "card" || layout === "card-compact"
          ? `arena-board-quick-actions arena-board-quick-actions--card${
              layout === "card-compact" ? " arena-board-quick-actions--card-compact" : ""
            }`
          : "arena-board-quick-actions"
      }
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onBuy();
        }}
        className="arena-board-quick-btn arena-board-quick-btn--buy"
      >
        <span className="arena-board-quick-btn__label">Buy</span>
        {layout !== "card-compact" ? (
          <span className="arena-board-quick-btn__value financial-value">
            {prefs.buyAmountBnb} {NATIVE_SYMBOL}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSell();
        }}
        className="arena-board-quick-btn arena-board-quick-btn--sell"
      >
        <span className="arena-board-quick-btn__label">Sell</span>
        {layout !== "card-compact" ? (
          <span className="arena-board-quick-btn__value financial-value">{prefs.sellPercent}%</span>
        ) : null}
      </button>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { QuickTradeSettingsSheet } from "@/components/arena/QuickTradeSettingsSheet";
import { dismissHoldingsSwipeHint } from "@/components/portfolio/HoldingSwipeRow";
import {
  ARENA_QUICK_TRADE_CHANGE_EVENT,
  DEFAULT_ARENA_QUICK_TRADE,
  readArenaQuickTradePrefs,
  writeArenaQuickTradePrefs,
  type ArenaQuickTradePrefs,
} from "@/lib/arena-quick-trade";

/** Stable layer — must stay module-scoped so typing does not remount inputs (iOS keyboard). */
function ArenaQuickTradeSettingsLayer({
  settingsOpen,
  draftBuy,
  draftSellPct,
  onBuyChange,
  onSellPctChange,
  onClose,
  onSave,
}: {
  settingsOpen: boolean;
  draftBuy: string;
  draftSellPct: string;
  onBuyChange: (value: string) => void;
  onSellPctChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <QuickTradeSettingsSheet
      open={settingsOpen}
      draftBuy={draftBuy}
      draftSellPct={draftSellPct}
      onBuyChange={onBuyChange}
      onSellPctChange={onSellPctChange}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

export function useArenaQuickTradeSettings() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState<ArenaQuickTradePrefs>(DEFAULT_ARENA_QUICK_TRADE);
  const [draftBuy, setDraftBuy] = useState(DEFAULT_ARENA_QUICK_TRADE.buyAmountUsd);
  const [draftSellPct, setDraftSellPct] = useState(String(DEFAULT_ARENA_QUICK_TRADE.sellPercent));

  const syncPrefs = useCallback(() => {
    const next = readArenaQuickTradePrefs();
    setPrefs(next);
    setDraftBuy(next.buyAmountUsd);
    setDraftSellPct(String(next.sellPercent));
  }, []);

  useEffect(() => {
    syncPrefs();

    const onChange = () => syncPrefs();
    window.addEventListener(ARENA_QUICK_TRADE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(ARENA_QUICK_TRADE_CHANGE_EVENT, onChange);
  }, [syncPrefs]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const openSettings = useCallback(() => {
    syncPrefs();
    setSettingsOpen(true);
  }, [syncPrefs]);

  const saveSettings = useCallback(() => {
    const sellPercent = Number(draftSellPct);
    writeArenaQuickTradePrefs({
      buyAmountUsd: draftBuy,
      sellPercent: Number.isFinite(sellPercent) ? sellPercent : DEFAULT_ARENA_QUICK_TRADE.sellPercent,
    });
    setSettingsOpen(false);
    dismissHoldingsSwipeHint();
  }, [draftBuy, draftSellPct]);

  const settingsLayer = (
    <ArenaQuickTradeSettingsLayer
      settingsOpen={settingsOpen}
      draftBuy={draftBuy}
      draftSellPct={draftSellPct}
      onBuyChange={setDraftBuy}
      onSellPctChange={setDraftSellPct}
      onClose={closeSettings}
      onSave={saveSettings}
    />
  );

  return {
    prefs,
    settingsOpen,
    openSettings,
    closeSettings,
    settingsLayer,
  };
}

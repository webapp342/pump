"use client";

import { useCallback, useEffect, useSyncExternalStore, useState, type RefObject } from "react";
import { QuickTradeSettingsSheet } from "@/components/arena/QuickTradeSettingsSheet";
import { dismissHoldingsSwipeHint } from "@/components/portfolio/HoldingSwipeRow";
import { ModalPortal } from "@/components/ui/ModalPortal";
import {
  ARENA_QUICK_TRADE_CHANGE_EVENT,
  DEFAULT_ARENA_QUICK_TRADE,
  readArenaQuickTradePrefs,
  writeArenaQuickTradePrefs,
  type ArenaQuickTradePrefs,
} from "@/lib/arena-quick-trade";

const MOBILE_SHEET_MQ = "(max-width: 767px)";

function subscribeMobileSheetMq(onStoreChange: () => void) {
  const mq = window.matchMedia(MOBILE_SHEET_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMobileSheetSnapshot() {
  return window.matchMedia(MOBILE_SHEET_MQ).matches;
}

function getMobileSheetServerSnapshot() {
  return false;
}

function useMobileQuickTradeSheet() {
  return useSyncExternalStore(subscribeMobileSheetMq, getMobileSheetSnapshot, getMobileSheetServerSnapshot);
}

type PopoverPosition = {
  top: number;
  right: number;
};

function readPopoverPosition(anchor: HTMLElement): PopoverPosition {
  const rect = anchor.getBoundingClientRect();
  return {
    top: rect.bottom + 6,
    right: Math.max(12, window.innerWidth - rect.right),
  };
}

function QuickTradeSettingsPanel({
  draftBuy,
  draftSellPct,
  onBuyChange,
  onSellPctChange,
  onCancel,
  onSave,
}: {
  draftBuy: string;
  draftSellPct: string;
  onBuyChange: (value: string) => void;
  onSellPctChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-body-sm font-semibold text-pump-text">Quick trade amounts</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1">
        <label className="space-y-1.5">
          <span className="field-label">Buy amount (USD)</span>
          <input
            type="text"
            inputMode="decimal"
            value={draftBuy}
            onChange={(event) => onBuyChange(event.target.value)}
            className="field-input h-10 w-full text-body-sm"
            placeholder="3"
          />
        </label>
        <label className="space-y-1.5">
          <span className="field-label">Sell (% of balance)</span>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={draftSellPct}
            onChange={(event) => onSellPctChange(event.target.value)}
            className="field-input h-10 w-full text-body-sm"
            placeholder="50"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="secondary-button h-10 px-4 text-body-sm">
          Cancel
        </button>
        <button type="button" onClick={onSave} className="primary-button h-10 px-4 text-body-sm">
          Save
        </button>
      </div>
    </div>
  );
}

type ArenaQuickTradeSettingsLayerProps = {
  settingsOpen: boolean;
  useMobileSheet: boolean;
  popoverPos: PopoverPosition | null;
  draftBuy: string;
  draftSellPct: string;
  onBuyChange: (value: string) => void;
  onSellPctChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

/** Stable layer — must stay module-scoped so typing does not remount inputs (iOS keyboard). */
function ArenaQuickTradeSettingsLayer({
  settingsOpen,
  useMobileSheet,
  popoverPos,
  draftBuy,
  draftSellPct,
  onBuyChange,
  onSellPctChange,
  onClose,
  onSave,
}: ArenaQuickTradeSettingsLayerProps) {
  if (!settingsOpen) return null;

  if (useMobileSheet) {
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

  if (!popoverPos) return null;

  return (
    <ModalPortal open>
      <div role="dialog" aria-modal="true" aria-label="Quick trade settings">
        <button
          type="button"
          className="fixed inset-0 z-[60] cursor-default bg-transparent"
          aria-label="Close quick trade settings"
          onClick={onClose}
        />
        <div
          className="modal-panel pointer-events-auto fixed z-[61] w-72 rounded-md border border-pump-border/25 bg-pump-card p-3 shadow-lg"
          style={{ top: popoverPos.top, right: popoverPos.right }}
        >
          <QuickTradeSettingsPanel
            draftBuy={draftBuy}
            draftSellPct={draftSellPct}
            onBuyChange={onBuyChange}
            onSellPctChange={onSellPctChange}
            onCancel={onClose}
            onSave={onSave}
          />
        </div>
      </div>
    </ModalPortal>
  );
}

export function useArenaQuickTradeSettings(anchorRef?: RefObject<HTMLElement | null>) {
  const useMobileSheet = useMobileQuickTradeSheet();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
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

  useEffect(() => {
    if (!settingsOpen || useMobileSheet) {
      setPopoverPos(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef?.current) return;
      setPopoverPos(readPopoverPosition(anchorRef.current));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [settingsOpen, useMobileSheet, anchorRef]);

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
      useMobileSheet={useMobileSheet}
      popoverPos={popoverPos}
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

"use client";

import { useCallback, useEffect, useSyncExternalStore, useState, type ReactNode } from "react";
import { NATIVE_SYMBOL } from "@/config/chain";
import { dismissHoldingsSwipeHint } from "@/components/portfolio/HoldingSwipeRow";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { PumpIcon, faSettings2 } from "@/lib/icons";
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

type QuickTradeSettingsFieldsProps = {
  draftBuy: string;
  draftSellPct: string;
  onBuyChange: (value: string) => void;
  onSellPctChange: (value: string) => void;
};

function QuickTradeSettingsFields({
  draftBuy,
  draftSellPct,
  onBuyChange,
  onSellPctChange,
}: QuickTradeSettingsFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="field-label">Buy amount ({NATIVE_SYMBOL})</span>
        <input
          type="text"
          inputMode="decimal"
          value={draftBuy}
          onChange={(event) => onBuyChange(event.target.value)}
          className="field-input h-10 w-full text-body-sm"
          placeholder="0.01"
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
  );
}

function QuickTradeSettingsActions({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className="secondary-button h-10 px-4 text-body-sm">
        Cancel
      </button>
      <button type="button" onClick={onSave} className="primary-button h-10 px-4 text-body-sm">
        Save
      </button>
    </div>
  );
}

function QuickTradeSettingsPanel({
  title = "Quick trade amounts",
  draftBuy,
  draftSellPct,
  onBuyChange,
  onSellPctChange,
  onCancel,
  onSave,
  className = "",
}: QuickTradeSettingsFieldsProps & {
  title?: string;
  onCancel: () => void;
  onSave: () => void;
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <p className="text-body-sm font-semibold text-pump-text">{title}</p>
      <QuickTradeSettingsFields
        draftBuy={draftBuy}
        draftSellPct={draftSellPct}
        onBuyChange={onBuyChange}
        onSellPctChange={onSellPctChange}
      />
      <QuickTradeSettingsActions onCancel={onCancel} onSave={onSave} />
    </div>
  );
}

export function ArenaSwipeTradeBar({ compact = false }: { compact?: boolean }) {
  const useMobileSheet = useMobileQuickTradeSheet();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState<ArenaQuickTradePrefs>(DEFAULT_ARENA_QUICK_TRADE);
  const [draftBuy, setDraftBuy] = useState(DEFAULT_ARENA_QUICK_TRADE.buyAmountBnb);
  const [draftSellPct, setDraftSellPct] = useState(String(DEFAULT_ARENA_QUICK_TRADE.sellPercent));

  const syncPrefs = useCallback(() => {
    const next = readArenaQuickTradePrefs();
    setPrefs(next);
    setDraftBuy(next.buyAmountBnb);
    setDraftSellPct(String(next.sellPercent));
  }, []);

  useEffect(() => {
    syncPrefs();

    const onChange = () => syncPrefs();
    window.addEventListener(ARENA_QUICK_TRADE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(ARENA_QUICK_TRADE_CHANGE_EVENT, onChange);
  }, [syncPrefs]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  const closeSettings = () => setSettingsOpen(false);

  const openSettings = () => {
    syncPrefs();
    setSettingsOpen((open) => !open);
  };

  const saveSettings = () => {
    const sellPercent = Number(draftSellPct);
    writeArenaQuickTradePrefs({
      buyAmountBnb: draftBuy,
      sellPercent: Number.isFinite(sellPercent) ? sellPercent : DEFAULT_ARENA_QUICK_TRADE.sellPercent,
    });
    setSettingsOpen(false);
    dismissHoldingsSwipeHint();
  };

  const settingsPanel = (
    <QuickTradeSettingsPanel
      draftBuy={draftBuy}
      draftSellPct={draftSellPct}
      onBuyChange={setDraftBuy}
      onSellPctChange={setDraftSellPct}
      onCancel={closeSettings}
      onSave={saveSettings}
    />
  );

  let settingsChrome: ReactNode = null;

  if (settingsOpen && useMobileSheet) {
    settingsChrome = (
      <ModalPortal open>
        <div
          className="modal-backdrop modal-backdrop-shell z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Quick trade settings"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close quick trade settings"
            onClick={closeSettings}
          />
          <div className="modal-panel pointer-events-auto relative w-full max-w-lg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {settingsPanel}
          </div>
        </div>
      </ModalPortal>
    );
  } else if (settingsOpen) {
    settingsChrome = (
      <>
        <button
          type="button"
          className="fixed inset-0 z-20 cursor-default"
          aria-label="Close settings"
          onClick={closeSettings}
        />
        <div className="absolute right-0 top-full z-30 mt-1 w-72 space-y-2 rounded-md border border-pump-border/25 bg-pump-card p-3 shadow-lg">
          {settingsPanel}
        </div>
      </>
    );
  }

  return (
    <div className="relative shrink-0">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <p className="text-caption leading-snug text-pump-muted">
          {!compact ? (
            <span className="hidden lg:inline text-pump-muted">Quick trade: </span>
          ) : null}
          <span className="font-medium text-pump-success">
            {!compact ? <span className="hidden lg:inline">Buy </span> : null}
            {prefs.buyAmountBnb}
            {!compact ? <span className="hidden lg:inline"> {NATIVE_SYMBOL}</span> : null}
          </span>
          <span className="text-pump-muted/45"> · </span>
          <span className="font-medium text-pump-danger">
            {!compact ? <span className="hidden lg:inline">Sell </span> : null}
            {prefs.sellPercent}%
          </span>
        </p>
        <button
          type="button"
          onClick={openSettings}
          className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-md text-caption font-semibold text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text ${
            compact ? "h-9 min-w-9 px-2 md:h-7 md:min-w-0 md:px-1.5" : "h-9 min-w-9 px-2 lg:h-8 lg:min-w-0 lg:px-2.5"
          } ${settingsOpen ? "bg-pump-border/10 text-pump-text" : ""}`}
          aria-label="Quick trade settings"
          aria-expanded={settingsOpen}
          aria-haspopup={useMobileSheet ? "dialog" : undefined}
        >
          <PumpIcon icon={faSettings2} className="size-4 md:size-3.5" />
          {!compact ? <span className="hidden lg:inline">Settings</span> : null}
        </button>
      </div>

      {settingsChrome}
    </div>
  );
}

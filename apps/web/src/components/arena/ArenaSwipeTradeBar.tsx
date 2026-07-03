"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, useState } from "react";
import { dismissHoldingsSwipeHint } from "@/components/portfolio/HoldingSwipeRow";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { PumpIcon, faBolt, faPencil } from "@/lib/icons";
import {
  ARENA_QUICK_TRADE_CHANGE_EVENT,
  DEFAULT_ARENA_QUICK_TRADE,
  formatQuickTradeBuyUsd,
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
}: QuickTradeSettingsFieldsProps & {
  title?: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
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

type ArenaSwipeTradeBarProps = {
  /**
   * `default` — Arena inline row.
   * `sidebar` / `mobile-sheet` — stacked amounts with per-row edit icons (trade sidebar + mobile picker).
   */
  variant?: "default" | "sidebar" | "mobile-sheet";
};

function QuickTradeEditButton({
  ariaLabel,
  open,
  onClick,
}: {
  ariaLabel: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`arena-quick-trade-bar__edit${open ? " arena-quick-trade-bar__edit--open" : ""}`}
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      <PumpIcon icon={faPencil} className="arena-quick-trade-bar__edit-icon" aria-hidden />
    </button>
  );
}

export function ArenaSwipeTradeBar({ variant = "default" }: ArenaSwipeTradeBarProps) {
  const stacked = variant === "sidebar" || variant === "mobile-sheet";
  const compactLabels = variant === "sidebar" || variant === "mobile-sheet";
  const useMobileSheet = useMobileQuickTradeSheet();
  const anchorRef = useRef<HTMLDivElement>(null);
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
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen || useMobileSheet) {
      setPopoverPos(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef.current) return;
      setPopoverPos(readPopoverPosition(anchorRef.current));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [settingsOpen, useMobileSheet]);

  const closeSettings = () => setSettingsOpen(false);

  const openSettings = () => {
    syncPrefs();
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const sellPercent = Number(draftSellPct);
    writeArenaQuickTradePrefs({
      buyAmountUsd: draftBuy,
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

  const barClass = [
    "arena-quick-trade-bar relative shrink-0",
    variant === "sidebar" ? "arena-quick-trade-bar--sidebar" : "",
    variant === "mobile-sheet" ? "arena-quick-trade-bar--mobile-sheet" : "",
    stacked ? "arena-quick-trade-bar--stacked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={anchorRef} className={barClass}>
      <div className="arena-quick-trade-bar__cluster">
        <div
          className={`arena-quick-trade-bar__summary${
            stacked ? " arena-quick-trade-bar__summary--stacked" : ""
          }`}
          aria-label="Quick trade amounts"
        >
          <span className="arena-quick-trade-bar__leg arena-quick-trade-bar__buy">
            <span className="arena-quick-trade-bar__leg-main">
              <PumpIcon icon={faBolt} className="arena-quick-trade-bar__flash" aria-hidden />
              {!compactLabels ? (
                <span className="arena-quick-trade-bar__label hidden md:inline">Buy</span>
              ) : null}
              <span className="arena-quick-trade-bar__value financial-value">
                {formatQuickTradeBuyUsd(prefs.buyAmountUsd)}
              </span>
            </span>
            <QuickTradeEditButton
              ariaLabel="Edit quick buy amount"
              open={settingsOpen}
              onClick={openSettings}
            />
          </span>
          <span className="arena-quick-trade-bar__leg arena-quick-trade-bar__sell">
            <span className="arena-quick-trade-bar__leg-main">
              <PumpIcon icon={faBolt} className="arena-quick-trade-bar__flash" aria-hidden />
              {!compactLabels ? (
                <span className="arena-quick-trade-bar__label hidden md:inline">Sell</span>
              ) : null}
              <span className="arena-quick-trade-bar__value financial-value">{prefs.sellPercent}%</span>
            </span>
            <QuickTradeEditButton
              ariaLabel="Edit quick sell percent"
              open={settingsOpen}
              onClick={openSettings}
            />
          </span>
        </div>
      </div>

      {settingsOpen && useMobileSheet ? (
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
      ) : null}

      {settingsOpen && !useMobileSheet && popoverPos ? (
        <ModalPortal open>
          <div role="dialog" aria-modal="true" aria-label="Quick trade settings">
            <button
              type="button"
              className="fixed inset-0 z-[60] cursor-default bg-transparent"
              aria-label="Close quick trade settings"
              onClick={closeSettings}
            />
            <div
              className="modal-panel pointer-events-auto fixed z-[61] w-72 rounded-md border border-pump-border/25 bg-pump-card p-3 shadow-lg"
              style={{ top: popoverPos.top, right: popoverPos.right }}
            >
              {settingsPanel}
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

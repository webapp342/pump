"use client";

import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { PumpIcon, faBolt } from "@/lib/icons";

type QuickTradeSettingsSheetProps = {
  open: boolean;
  draftBuy: string;
  draftSellPct: string;
  onBuyChange: (value: string) => void;
  onSellPctChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function QuickTradeSettingsSheet({
  open,
  draftBuy,
  draftSellPct,
  onBuyChange,
  onSellPctChange,
  onClose,
  onSave,
}: QuickTradeSettingsSheetProps) {
  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Flash trade settings"
      title="Flash trade"
      zIndex={120}
      panelClassName="quick-trade-settings-modal max-w-md"
      bodyClassName="quick-trade-settings-modal__body"
      headerLeading={
        <PumpIcon
          icon={faBolt}
          className="quick-trade-settings-modal__title-icon"
          aria-hidden
        />
      }
      footer={
        <div className="quick-trade-settings-modal__footer">
          <button type="button" onClick={onClose} className="secondary-button w-full">
            Cancel
          </button>
          <button type="button" onClick={onSave} className="primary-button w-full">
            Save
          </button>
        </div>
      }
    >
      <div className="quick-trade-settings-modal__fields">
        <div className="quick-trade-settings-modal__field">
          <label className="field-label" htmlFor="quick-trade-buy-usd">
            Buy amount (USD)
          </label>
          <input
            id="quick-trade-buy-usd"
            type="text"
            inputMode="decimal"
            value={draftBuy}
            onChange={(event) => onBuyChange(event.target.value)}
            className="field-input financial-value w-full"
            placeholder="3.00"
            autoComplete="off"
          />
          <p className="field-hint">Spent per flash Buy on the list.</p>
        </div>

        <div className="quick-trade-settings-modal__field">
          <label className="field-label" htmlFor="quick-trade-sell-pct">
            Sell amount (%)
          </label>
          <input
            id="quick-trade-sell-pct"
            type="text"
            inputMode="numeric"
            value={draftSellPct}
            onChange={(event) => onSellPctChange(event.target.value)}
            className="field-input financial-value w-full"
            placeholder="50"
            autoComplete="off"
          />
          <p className="field-hint">Share of balance sold per flash Sell.</p>
        </div>
      </div>
    </AppBottomSheet>
  );
}

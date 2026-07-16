"use client";

import { useArenaQuickTradeSettings } from "@/hooks/useArenaQuickTradeSettings";
import { PumpIcon, faBolt, faPencil } from "@/lib/icons";
import { formatQuickTradeBuyUsd } from "@/lib/arena-quick-trade";

type ArenaSwipeTradeBarProps = {
  /**
   * `default` — Arena inline row (legacy summary display).
   * `sidebar` / `mobile-sheet` — stacked amounts with per-row edit icons.
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
      <PumpIcon icon={faPencil} size="xs" className="arena-quick-trade-bar__edit-icon" aria-hidden />
    </button>
  );
}

export function ArenaSwipeTradeBar({ variant = "default" }: ArenaSwipeTradeBarProps) {
  const { prefs, settingsOpen, openSettings, settingsLayer } = useArenaQuickTradeSettings();
  const stacked = variant === "sidebar" || variant === "mobile-sheet";
  const showLabels = stacked;

  const barClass = [
    "arena-quick-trade-bar relative shrink-0",
    variant === "sidebar" ? "arena-quick-trade-bar--sidebar" : "",
    variant === "mobile-sheet" ? "arena-quick-trade-bar--mobile-sheet" : "",
    stacked ? "arena-quick-trade-bar--stacked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={barClass}>
      <div className="arena-quick-trade-bar__cluster">
        <div
          className={`arena-quick-trade-bar__summary${
            stacked ? " arena-quick-trade-bar__summary--stacked" : ""
          }`}
          aria-label="Quick trade amounts"
        >
          <span className="arena-quick-trade-bar__leg arena-quick-trade-bar__buy">
            <span className="arena-quick-trade-bar__leg-main">
              <PumpIcon icon={faBolt} size="xs" className="arena-quick-trade-bar__flash" aria-hidden />
              {showLabels ? <span className="arena-quick-trade-bar__label">Buy</span> : null}
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
              <PumpIcon icon={faBolt} size="xs" className="arena-quick-trade-bar__flash" aria-hidden />
              {showLabels ? <span className="arena-quick-trade-bar__label">Sell</span> : null}
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
      {settingsLayer}
    </div>
  );
}

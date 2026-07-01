"use client";

import { NATIVE_SYMBOL } from "@/config/chain";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";

function formatHeaderBalanceUsd(usd: number | null): string {
  if (usd == null || !Number.isFinite(usd)) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function formatHeaderBalanceNative(native: number): string {
  if (!Number.isFinite(native) || native <= 0) return `0 ${NATIVE_SYMBOL}`;
  if (native >= 1) return `${native.toFixed(4)} ${NATIVE_SYMBOL}`;
  if (native >= 0.0001) return `${native.toFixed(4)} ${NATIVE_SYMBOL}`;
  return `${native.toFixed(6)} ${NATIVE_SYMBOL}`;
}

function formatNativeAvailable(native: number): string {
  return formatHeaderBalanceNative(native);
}

export type WalletAccountPanelProps = {
  address: string;
  bnbAmount: number;
  usdAmount: number | null;
  showBnb: boolean;
  onToggleBalanceUnit: () => void;
  onClose: () => void;
  onLogout: () => void;
  variant?: "dropdown" | "sheet";
};

export function WalletAccountPanel({
  address,
  bnbAmount,
  usdAmount,
  showBnb,
  onToggleBalanceUnit,
  onClose,
  onLogout,
  variant = "dropdown",
}: WalletAccountPanelProps) {
  const { openDeposit, openWithdraw } = useWalletFunding();
  const rootClass =
    variant === "sheet" ? "wallet-account-panel wallet-account-panel--sheet" : "wallet-account-panel";

  if (variant === "sheet") {
    return (
      <div className={rootClass} role="menu">
        <div className="wallet-account-panel__balance-block">
          <button
            type="button"
            onClick={onToggleBalanceUnit}
            className="wallet-account-panel__balance-toggle wallet-account-panel__balance-toggle--hero"
            aria-label={showBnb ? "Show balance in USD" : `Show balance in ${NATIVE_SYMBOL}`}
          >
            <span className="financial-value wallet-account-panel__balance-value wallet-account-panel__balance-value--hero">
              {showBnb ? formatHeaderBalanceNative(bnbAmount) : formatHeaderBalanceUsd(usdAmount)}
            </span>
          </button>
          <p className="wallet-account-panel__hero-sub">
            {showBnb
              ? formatHeaderBalanceUsd(usdAmount)
              : formatNativeAvailable(bnbAmount)}{" "}
            · tap to switch
          </p>
        </div>

        <div className="wallet-account-panel__actions wallet-account-panel__actions--hero">
          <button
            type="button"
            onClick={() => {
              onClose();
              openDeposit();
            }}
            className="primary-button py-2.5 text-body-sm"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              openWithdraw();
            }}
            className="secondary-button py-2.5 text-body-sm"
          >
            Withdraw
          </button>
        </div>

        <div className="wallet-account-panel__menu">
          <div className="wallet-account-panel__menu-item wallet-account-panel__menu-item--static">
            <span className="wallet-account-panel__menu-leading">
              <span className="text-body-sm text-pump-text">Appearance</span>
            </span>
            <ThemePicker className="wallet-account-panel__appearance-toggle" />
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onLogout();
            onClose();
          }}
          className="wallet-account-panel__logout-text"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className={rootClass} role="menu">
      <p className="section-label text-pump-muted">Account balance</p>
      <button
        type="button"
        onClick={onToggleBalanceUnit}
        className="wallet-account-panel__balance-toggle"
        aria-label={showBnb ? "Show balance in USD" : `Show balance in ${NATIVE_SYMBOL}`}
      >
        <span className="financial-value wallet-account-panel__balance-value">
          {showBnb ? formatHeaderBalanceNative(bnbAmount) : formatHeaderBalanceUsd(usdAmount)}
        </span>
      </button>
      <p className="mt-0.5 text-caption text-pump-muted">
        {showBnb
          ? `${formatHeaderBalanceUsd(usdAmount)} available`
          : `${formatNativeAvailable(bnbAmount)} available`}
      </p>

      <div className="wallet-account-panel__actions">
        <button
          type="button"
          onClick={() => {
            onClose();
            openDeposit();
          }}
          className="primary-button py-2.5 text-body-sm"
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            openWithdraw();
          }}
          className="secondary-button py-2.5 text-body-sm"
        >
          Withdraw
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          onLogout();
          onClose();
        }}
        className="wallet-account-panel__logout"
      >
        Log out
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { NATIVE_SYMBOL, shortAddress } from "@/config/chain";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { PushNotificationsPanel } from "@/components/push/PushNotificationsPanel";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { PumpIcon, faCopy, faWallet } from "@/lib/icons";

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

function SmartWalletAddressRow({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const ok = await copyToClipboard(address);
    setCopied(ok);
    if (ok) {
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="wallet-account-panel__address"
      aria-label="Copy smart wallet address"
    >
      <span className="min-w-0 text-left">
        <span className="block section-label text-pump-muted">Smart wallet</span>
        <span className="financial-value">{shortAddress(address)}</span>
      </span>
      <span className="wallet-account-panel__address-copy shrink-0">
        <PumpIcon icon={faCopy} className="h-3.5 w-3.5" />
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

function WalletActionButtons({
  onClose,
  onExportWallet,
}: {
  onClose: () => void;
  onExportWallet: () => void;
}) {
  const { openDeposit, openWithdraw } = useWalletFunding();

  return (
    <>
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
        onClick={onExportWallet}
        className="secondary-button wallet-account-panel__export-btn py-2.5 text-body-sm"
      >
        <PumpIcon icon={faWallet} className="mr-1.5 h-3.5 w-3.5 shrink-0" />
        Export wallet
      </button>
    </>
  );
}

export type WalletAccountPanelProps = {
  address: string;
  bnbAmount: number;
  usdAmount: number | null;
  showBnb: boolean;
  onToggleBalanceUnit: () => void;
  onClose: () => void;
  onLogout: () => void;
  onExportWallet: () => void;
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
  onExportWallet,
  variant = "dropdown",
}: WalletAccountPanelProps) {
  const rootClass =
    variant === "sheet" ? "wallet-account-panel wallet-account-panel--sheet" : "wallet-account-panel";

  const openExportWallet = () => {
    onClose();
    onExportWallet();
  };

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
            <SmartWalletAddressRow address={address} />
          </div>

          <div className="wallet-account-panel__actions--hero">
            <WalletActionButtons onClose={onClose} onExportWallet={openExportWallet} />
          </div>

          <div className="wallet-account-panel__menu">
            <PushNotificationsPanel />
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
        <SmartWalletAddressRow address={address} />

        <WalletActionButtons onClose={onClose} onExportWallet={openExportWallet} />

        <div className="wallet-account-panel__appearance">
          <span className="wallet-account-panel__appearance-label">Appearance</span>
          <ThemePicker className="wallet-account-panel__appearance-toggle" />
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

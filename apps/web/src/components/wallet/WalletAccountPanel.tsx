"use client";

import { useState, type MouseEvent } from "react";
import { formatEther } from "viem";
import { NATIVE_SYMBOL, shortAddress } from "@/config/chain";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { PumpIcon, faCopy } from "@/lib/icons";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { startScwDepositWatch } from "@/lib/scw-balance-sync";
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
  const [copied, setCopied] = useState(false);
  const rootClass =
    variant === "sheet" ? "wallet-account-panel wallet-account-panel--sheet" : "wallet-account-panel";

  async function onCopyAddress(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const ok = await copyToClipboard(address);
    setCopied(ok);
    if (ok) {
      startScwDepositWatch();
      setTimeout(() => setCopied(false), 2000);
    }
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

      <button
        type="button"
        onClick={(event) => void onCopyAddress(event)}
        className="wallet-account-panel__address"
        aria-label={copied ? "Address copied" : "Copy smart wallet address"}
      >
        <span className="financial-value">{shortAddress(address)}</span>
        <span className="flex items-center gap-1 text-pump-muted">
          {copied ? "Copied" : <PumpIcon icon={faCopy} className="h-3.5 w-3.5" />}
        </span>
      </button>
      <p className="mt-1 text-caption text-pump-muted">Smart wallet · deposit address</p>

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

      {variant === "sheet" ? (
        <div className="wallet-account-panel__appearance">
          <span className="wallet-account-panel__appearance-label">Appearance</span>
          <ThemePicker className="wallet-account-panel__appearance-toggle" />
        </div>
      ) : null}
    </div>
  );
}

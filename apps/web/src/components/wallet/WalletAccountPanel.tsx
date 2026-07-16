"use client";

import { NATIVE_SYMBOL } from "@/config/chain";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { PushNotificationsPanel } from "@/components/push/PushNotificationsPanel";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import {
  PumpIcon,
  faArrowDown,
  faArrowUp,
  faLogout,
  faSliders,
  faUserPen,
} from "@/lib/icons";

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

function WalletFundButtons({ onClose }: { onClose: () => void }) {
  const { openDeposit, openWithdraw } = useWalletFunding();

  return (
    <div className="wallet-account-panel__fund">
      <button
        type="button"
        onClick={() => {
          onClose();
          openDeposit();
        }}
        className="wallet-account-panel__fund-btn wallet-account-panel__fund-btn--deposit"
      >
        <span className="wallet-account-panel__fund-icon" aria-hidden>
          <PumpIcon icon={faArrowDown} className="h-4 w-4" />
        </span>
        <span className="wallet-account-panel__fund-label">Deposit</span>
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          openWithdraw();
        }}
        className="wallet-account-panel__fund-btn wallet-account-panel__fund-btn--withdraw"
      >
        <span className="wallet-account-panel__fund-icon" aria-hidden>
          <PumpIcon icon={faArrowUp} className="h-4 w-4" />
        </span>
        <span className="wallet-account-panel__fund-label">Withdraw</span>
      </button>
    </div>
  );
}

function BalanceUnitSwitch({
  showBnb,
  onSelectUsd,
  onSelectNative,
}: {
  showBnb: boolean;
  onSelectUsd: () => void;
  onSelectNative: () => void;
}) {
  return (
    <div className="wallet-account-panel__unit-switch" role="group" aria-label="Balance display currency">
      <button
        type="button"
        className={showBnb ? "" : "is-active"}
        onClick={onSelectUsd}
        aria-pressed={!showBnb}
      >
        USD
      </button>
      <button
        type="button"
        className={showBnb ? "is-active" : ""}
        onClick={onSelectNative}
        aria-pressed={showBnb}
      >
        {NATIVE_SYMBOL}
      </button>
    </div>
  );
}

function AccountSummaryCard({
  nativeBnb,
  nativeUsd,
  showBnb,
  onSelectUsd,
  onSelectNative,
}: {
  nativeBnb: number;
  nativeUsd: number;
  showBnb: boolean;
  onSelectUsd: () => void;
  onSelectNative: () => void;
}) {
  const availablePrimary = showBnb
    ? formatHeaderBalanceNative(nativeBnb)
    : formatHeaderBalanceUsd(nativeUsd);

  return (
    <section className="wallet-account-panel__summary">
      <div className="wallet-account-panel__balance-hero">
        <p className="wallet-account-panel__metric-label">Available to trade</p>
        <div className="wallet-account-panel__balance-row">
          <div className="wallet-account-panel__balance-main">
            <span className="financial-value wallet-account-panel__balance-amount">
              {availablePrimary}
            </span>
          </div>
          <BalanceUnitSwitch
            showBnb={showBnb}
            onSelectUsd={onSelectUsd}
            onSelectNative={onSelectNative}
          />
        </div>
      </div>
    </section>
  );
}

function AccountSettingsNav({
  onLogout,
  onClose,
  onEditProfile,
  showPushNotifications,
}: {
  onLogout: () => void;
  onClose: () => void;
  onEditProfile?: () => void;
  showPushNotifications: boolean;
}) {
  return (
    <nav className="wallet-account-panel__nav" aria-label="Settings">
      {onEditProfile ? (
        <button
          type="button"
          onClick={() => {
            onClose();
            onEditProfile();
          }}
          className="wallet-account-panel__nav-row"
        >
          <span className="wallet-account-panel__nav-label">
            <PumpIcon icon={faUserPen} className="wallet-account-panel__nav-icon" aria-hidden />
            Edit profile
          </span>
        </button>
      ) : null}
      {showPushNotifications ? <PushNotificationsPanel variant="settings" /> : null}
      <div className="wallet-account-panel__nav-row wallet-account-panel__nav-row--static">
        <span className="wallet-account-panel__nav-label">
          <PumpIcon icon={faSliders} className="wallet-account-panel__nav-icon" aria-hidden />
          Appearance
        </span>
        <ThemePicker
          className="wallet-account-panel__appearance-toggle"
          showLabel
        />
      </div>
      <button
        type="button"
        onClick={() => {
          onLogout();
          onClose();
        }}
        className="wallet-account-panel__nav-row wallet-account-panel__nav-row--danger"
      >
        <span className="wallet-account-panel__nav-label">
          <PumpIcon icon={faLogout} className="wallet-account-panel__nav-icon" aria-hidden />
          Log out
        </span>
      </button>
    </nav>
  );
}

export type WalletAccountPanelProps = {
  nativeBnb: number;
  nativeUsd: number;
  showBnb: boolean;
  onToggleBalanceUnit: () => void;
  onClose: () => void;
  onLogout: () => void;
  /** Opens profile editor after the sheet/dropdown closes. */
  onEditProfile?: () => void;
  /** dropdown = desktop account menu; sheet = mobile Settings (no balance/funding). */
  variant?: "dropdown" | "sheet";
};

export function WalletAccountPanel({
  nativeBnb,
  nativeUsd,
  showBnb,
  onToggleBalanceUnit,
  onClose,
  onLogout,
  onEditProfile,
  variant = "dropdown",
}: WalletAccountPanelProps) {
  const isSettingsSheet = variant === "sheet";
  const rootClass = isSettingsSheet
    ? "wallet-account-panel wallet-account-panel--sheet wallet-account-panel--settings"
    : "wallet-account-panel";

  const selectUsd = () => {
    if (showBnb) onToggleBalanceUnit();
  };

  const selectNative = () => {
    if (!showBnb) onToggleBalanceUnit();
  };

  return (
    <div className={rootClass} role="menu">
      {isSettingsSheet ? null : (
        <>
          <AccountSummaryCard
            nativeBnb={nativeBnb}
            nativeUsd={nativeUsd}
            showBnb={showBnb}
            onSelectUsd={selectUsd}
            onSelectNative={selectNative}
          />
          <WalletFundButtons onClose={onClose} />
        </>
      )}
      <AccountSettingsNav
        onLogout={onLogout}
        onClose={onClose}
        onEditProfile={onEditProfile}
        showPushNotifications={isSettingsSheet}
      />
    </div>
  );
}

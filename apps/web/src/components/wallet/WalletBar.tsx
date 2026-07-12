"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useWalletTotalBalance } from "@/hooks/useWalletTotalBalance";
import { UserAvatar } from "@/components/user/UserAvatar";
import { useUserAvatar } from "@/components/user/UserAvatarProvider";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { isPumpAuthConfigured } from "@/lib/auth-config";
import { PumpIcon, faChevronDown } from "@/lib/icons";
import { AccountSheet } from "@/components/wallet/AccountSheet";
import { WalletAccountPanel } from "@/components/wallet/WalletAccountPanel";

function formatHeaderBalanceUsd(usd: number | null): string {
  if (usd == null || !Number.isFinite(usd)) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function useMobileAccountEntry(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isMobile;
}

function ConnectedWalletButton({ address }: { address: string }) {
  const { avatarId } = useUserAvatar();
  const { logout } = usePumpWallet();
  const isMobileAccountEntry = useMobileAccountEntry();
  const [open, setOpen] = useState(false);
  const [showBnb, setShowBnb] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { nativeBnb, nativeUsd } = useWalletTotalBalance(address as `0x${string}`);

  const balanceLabel = formatHeaderBalanceUsd(nativeUsd);

  const panelProps = {
    address,
    nativeBnb,
    nativeUsd,
    showBnb,
    onToggleBalanceUnit: () => setShowBnb((value) => !value),
    onClose: () => setOpen(false),
    onLogout: () => void logout(),
  };

  useEffect(() => {
    if (!open || isMobileAccountEntry) return;

    function onPointerDown(event: globalThis.MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, isMobileAccountEntry]);

  if (isMobileAccountEntry) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="app-header-account-btn"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Open account"
        >
          {avatarId ? (
            <UserAvatar address={address} avatarId={avatarId} size={24} />
          ) : (
            <span className="app-header-account-btn__fallback" aria-hidden>
              {address.slice(2, 4).toUpperCase()}
            </span>
          )}
        </button>
        <AccountSheet open={open} {...panelProps} />
      </>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="app-header-account-chip"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open account menu"
      >
        {avatarId ? (
          <UserAvatar address={address} avatarId={avatarId} size={24} className="app-header-account-chip__avatar" />
        ) : (
          <span className="app-header-account-chip__avatar-fallback" aria-hidden>
            {address.slice(2, 4).toUpperCase()}
          </span>
        )}
        <span className="app-header-account-chip__balance financial-value">{balanceLabel}</span>
        <PumpIcon
          icon={faChevronDown}
          className={`app-header-account-chip__chevron transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="wallet-account-dropdown" role="presentation">
          <WalletAccountPanel {...panelProps} variant="dropdown" />
        </div>
      ) : null}
    </div>
  );
}

export function WalletBar() {
  const { ready, authenticated, scwAddress, login } = usePumpWallet();
  const { isConnected, isConnecting, isReconnecting } = useAccount();

  const sessionActive = ready && authenticated && Boolean(scwAddress);
  const wagmiBooting = isConnecting || isReconnecting || (sessionActive && !isConnected);
  const walletReady = sessionActive && (isConnected || wagmiBooting);

  if (!isPumpAuthConfigured()) {
    return <span className="text-caption text-pump-muted">Configure sign-in to continue</span>;
  }

  if (!ready || wagmiBooting) {
    if (sessionActive && scwAddress) {
      return <ConnectedWalletButton address={scwAddress} />;
    }

    return (
      <div
        aria-hidden
        style={{
          opacity: 0,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <button type="button" tabIndex={-1} className="app-header-sign-in-btn">
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div>
      {!walletReady ? (
        <button type="button" onClick={login} className="app-header-sign-in-btn">
          Sign in
        </button>
      ) : scwAddress ? (
        <ConnectedWalletButton address={scwAddress} />
      ) : null}
    </div>
  );
}

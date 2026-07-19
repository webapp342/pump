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

function walletAvatarFallback(address: string): string {
  if (address.startsWith("0x") && address.length >= 4) {
    return address.slice(2, 4).toUpperCase();
  }
  return address.slice(0, 2).toUpperCase();
}

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
  const { avatarId, hasStatusBadge } = useUserAvatar();
  const { logout } = usePumpWallet();
  const isMobileAccountEntry = useMobileAccountEntry();
  const [open, setOpen] = useState(false);
  const [showBnb, setShowBnb] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { nativeBnb, nativeUsd } = useWalletTotalBalance(address);

  const balanceLabel = formatHeaderBalanceUsd(nativeUsd);

  const panelProps = {
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
            <UserAvatar
              address={address}
              avatarId={avatarId}
              size="md"
              framed={hasStatusBadge}
            />
          ) : (
            <span className="app-header-account-btn__fallback" aria-hidden>
              {walletAvatarFallback(address)}
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
          <UserAvatar
            address={address}
            avatarId={avatarId}
            size="md"
            framed={hasStatusBadge}
            className="app-header-account-chip__avatar"
          />
        ) : (
          <span className="app-header-account-chip__avatar-fallback" aria-hidden>
            {walletAvatarFallback(address)}
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
  const { ready, authenticated, walletAddress, isWalletReady, login } = usePumpWallet();
  const { isConnecting, isReconnecting } = useAccount();

  const wagmiBooting = isConnecting || isReconnecting;
  const walletReady = isWalletReady || (ready && authenticated && wagmiBooting && Boolean(walletAddress));

  if (!isPumpAuthConfigured()) {
    return <span className="text-caption text-pump-muted">Configure sign-in to continue</span>;
  }

  if (!ready || (!isWalletReady && wagmiBooting && !walletAddress)) {
    if (walletAddress) {
      return <ConnectedWalletButton address={walletAddress} />;
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
        <span className="app-header-sign-in-btn">Sign in</span>
      </div>
    );
  }

  return (
    <div>
      {!walletReady ? (
        <button type="button" onClick={login} className="app-header-sign-in-btn">
          Sign in
        </button>
      ) : walletAddress ? (
        <ConnectedWalletButton address={walletAddress} />
      ) : null}
    </div>
  );
}

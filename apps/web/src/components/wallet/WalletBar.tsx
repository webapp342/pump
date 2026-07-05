"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useWalletTotalBalance } from "@/hooks/useWalletTotalBalance";
import { UserAvatar } from "@/components/user/UserAvatar";
import { useUserAvatar } from "@/components/user/UserAvatarProvider";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { isPumpAuthConfigured } from "@/lib/auth-config";
import { PumpIcon, faChevronDown } from "@/lib/icons";
import { NATIVE_SYMBOL } from "@/config/chain";
import { ExportWalletModal } from "@/components/wallet/ExportWalletModal";
import { AccountSheet } from "@/components/wallet/AccountSheet";
import { WalletAccountPanel } from "@/components/wallet/WalletAccountPanel";

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
  const [exportOpen, setExportOpen] = useState(false);
  const [showBnb, setShowBnb] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { totalUsd, nativeBnb } = useWalletTotalBalance(address as `0x${string}`);

  const balanceLabel = showBnb
    ? formatHeaderBalanceNative(nativeBnb)
    : formatHeaderBalanceUsd(totalUsd);

  const panelProps = {
    address,
    bnbAmount: nativeBnb,
    usdAmount: totalUsd,
    showBnb,
    onToggleBalanceUnit: () => setShowBnb((value) => !value),
    onClose: () => setOpen(false),
    onLogout: () => void logout(),
    onExportWallet: () => setExportOpen(true),
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
        <ExportWalletModal open={exportOpen} onClose={() => setExportOpen(false)} />
      </>
    );
  }

  return (
    <>
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="app-header-balance-btn"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="app-header-balance-btn__value financial-value">{balanceLabel}</span>
        <PumpIcon
          icon={faChevronDown}
          className={`app-header-balance-btn__chevron transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          className="wallet-account-dropdown absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-2rem))] border border-pump-border/50 bg-pump-card p-3"
          role="menu"
        >
          <WalletAccountPanel {...panelProps} variant="dropdown" />
        </div>
      ) : null}
    </div>
    <ExportWalletModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  );
}

export function WalletBar() {
  const { ready, authenticated, scwAddress, login } = usePumpWallet();
  const { isConnected } = useAccount();

  const walletReady =
    ready && authenticated && Boolean(scwAddress) && isConnected;

  if (!isPumpAuthConfigured()) {
    return <span className="text-caption text-pump-muted">Configure sign-in to continue</span>;
  }

  return (
    <div
      {...(!ready && {
        "aria-hidden": true,
        style: {
          opacity: 0,
          pointerEvents: "none",
          userSelect: "none",
        },
      })}
    >
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

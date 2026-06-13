"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { useBalance, useDisconnect, useWatchBlockNumber } from "wagmi";
import { pumpChain, shortAddress } from "@/config/chain";
import { UserAvatar } from "@/components/user/UserAvatar";
import { useUserAvatar } from "@/components/user/UserAvatarProvider";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd } from "@/lib/format-usd";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

function formatHeaderBalanceUsd(usd: number | null): string {
  if (usd == null || !Number.isFinite(usd)) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function formatHeaderBalanceBnb(bnb: number): string {
  if (!Number.isFinite(bnb) || bnb <= 0) return "0 BNB";
  if (bnb >= 1) return `${bnb.toFixed(4)} BNB`;
  if (bnb >= 0.0001) return `${bnb.toFixed(4)} BNB`;
  return `${bnb.toFixed(6)} BNB`;
}

function formatBnbAvailable(bnb: number): string {
  return formatHeaderBalanceBnb(bnb);
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-4 w-4 fill-none stroke-current transition ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current">
      <rect x="9" y="9" width="11" height="11" rx="2" strokeWidth="1.6" />
      <path d="M7 15H6a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" strokeWidth="1.6" />
    </svg>
  );
}

function PortfolioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current">
      <path
        d="M4 7h16M4 12h16M4 17h10"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current">
      <path
        d="M8 7l4-4 4 4M16 17l-4 4-4-4"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type WalletMenuProps = {
  address: string;
  bnbAmount: number;
  usdAmount: number | null;
  showBnb: boolean;
  onToggleBalanceUnit: () => void;
  onClose: () => void;
};

function WalletMenu({
  address,
  bnbAmount,
  usdAmount,
  showBnb,
  onToggleBalanceUnit,
  onClose,
}: WalletMenuProps) {
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);

  async function onCopyAddress(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const ok = await copyToClipboard(address);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  function onDisconnect() {
    disconnect();
    onClose();
  }

  return (
    <div
      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-pump-border/20 bg-pump-surface p-4 shadow-panel"
      role="menu"
    >
      <p className="section-label text-pump-muted">Your balance</p>
      <button
        type="button"
        onClick={onToggleBalanceUnit}
        className="mt-1 block text-left transition hover:text-pump-accent"
        aria-label={showBnb ? "Show balance in USD" : "Show balance in BNB"}
      >
        <span className="financial-value text-2xl font-semibold text-pump-text">
          {showBnb ? formatHeaderBalanceBnb(bnbAmount) : formatHeaderBalanceUsd(usdAmount)}
        </span>
      </button>
      <p className="mt-0.5 text-caption text-pump-muted">
        {showBnb
          ? `${formatHeaderBalanceUsd(usdAmount)} available`
          : `${formatBnbAvailable(bnbAmount)} available`}
      </p>

      <button
        type="button"
        onClick={(event) => void onCopyAddress(event)}
        className="mt-4 flex w-full items-center justify-between gap-2 rounded-lg border border-pump-border/18 bg-pump-card/40 px-3 py-2 text-caption text-pump-text transition hover:border-pump-accent/25"
        aria-label={copied ? "Address copied" : "Copy wallet address"}
      >
        <span className="financial-value">{shortAddress(address)}</span>
        <span className="flex items-center gap-1 text-pump-muted">
          {copied ? "Copied" : <CopyIcon />}
        </span>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/portfolio"
          onClick={onClose}
          className="flex flex-col items-center gap-2 rounded-lg border border-pump-border/15 bg-pump-card/35 px-3 py-3 text-center transition hover:border-pump-accent/25 hover:bg-pump-card/55"
        >
          <span className="text-pump-muted">
            <PortfolioIcon />
          </span>
          <span className="text-body-sm font-semibold text-pump-text">Portfolio</span>
          <span className="text-caption text-pump-muted">Holdings</span>
        </Link>
        <Link
          href="/"
          onClick={onClose}
          className="flex flex-col items-center gap-2 rounded-lg border border-pump-border/15 bg-pump-card/35 px-3 py-3 text-center transition hover:border-pump-accent/25 hover:bg-pump-card/55"
        >
          <span className="text-pump-muted">
            <TradeIcon />
          </span>
          <span className="text-body-sm font-semibold text-pump-text">Trade</span>
          <span className="text-caption text-pump-muted">Browse Arena</span>
        </Link>
      </div>

      <button
        type="button"
        onClick={onDisconnect}
        className="mt-3 w-full rounded-lg py-2.5 text-body-sm font-medium text-pump-danger transition hover:bg-pump-danger/10"
      >
        Disconnect
      </button>
    </div>
  );
}

function ConnectedWalletButton({ address }: { address: string }) {
  const { avatarId } = useUserAvatar();
  const { bnbUsd } = useBnbUsdPrice();
  const { data: balance, refetch: refetchBalance } = useBalance({
    address: address as `0x${string}`,
    chainId: pumpChain.id,
  });

  useWatchBlockNumber({
    chainId: pumpChain.id,
    onBlockNumber: () => {
      void refetchBalance();
    },
  });
  const [open, setOpen] = useState(false);
  const [showBnb, setShowBnb] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const bnbAmount = balance ? Number(formatEther(balance.value)) : 0;
  const usdAmount = bnbToUsd(bnbAmount, bnbUsd);
  const balanceLabel = showBnb
    ? formatHeaderBalanceBnb(bnbAmount)
    : formatHeaderBalanceUsd(usdAmount);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: globalThis.MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-pump-border/18 bg-pump-surface/52 px-2.5 text-sm font-medium text-pump-text transition hover:border-pump-accent/25"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {avatarId ? (
          <UserAvatar address={address} avatarId={avatarId} size={28} />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full bg-pump-success" aria-hidden />
        )}
        <span className="financial-value text-body-sm font-semibold">{balanceLabel}</span>
        <ChevronDownIcon open={open} />
      </button>
      {open ? (
        <WalletMenu
          address={address}
          bnbAmount={bnbAmount}
          usdAmount={usdAmount}
          showBnb={showBnb}
          onToggleBalanceUnit={() => setShowBnb((value) => !value)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function WalletBar() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        authenticationStatus,
        mounted,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

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
            {!connected ? (
              <button
                type="button"
                onClick={openConnectModal}
                className="primary-button h-11 px-4 py-0"
              >
                Connect wallet
              </button>
            ) : chain.unsupported ? (
              <button
                type="button"
                onClick={openChainModal}
                className="inline-flex h-11 items-center rounded-md border border-pump-danger/30 bg-pump-danger/10 px-3 text-sm font-semibold text-pump-danger"
              >
                Wrong network
              </button>
            ) : (
              <ConnectedWalletButton address={account.address} />
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

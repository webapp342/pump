"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Check, Copy, CreditCard, QrCode, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { explorerAddressUrl, pumpChain, shortAddress } from "@/config/chain";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import {
  DEPOSIT_WARNINGS,
  FUNDING_CHAIN_LABEL,
} from "@/lib/wallet-funding";
import { ModalPortal } from "@/components/ui/ModalPortal";
import type { WalletFundingOptions, WalletFundingView } from "@/components/wallet/WalletFundingProvider";

const ICON_STROKE = 1.75;

type WalletFundingModalProps = {
  open: boolean;
  view: WalletFundingView;
  options: WalletFundingOptions;
  canReturnToChoice: boolean;
  onClose: () => void;
  onViewChange: (view: WalletFundingView) => void;
  onOpenOnRamp: () => void;
};

function DepositQrCode({ address }: { address: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void QRCode.toDataURL(address, {
      margin: 1,
      width: 220,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!dataUrl) {
    return (
      <div className="wallet-fund-qr wallet-fund-qr--loading" aria-hidden>
        <span className="text-caption text-pump-muted">Generating QR…</span>
      </div>
    );
  }

  return (
    <div className="wallet-fund-qr">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`QR code for ${shortAddress(address)}`} width={196} height={196} />
    </div>
  );
}

export function WalletFundingModal({
  open,
  view,
  options,
  canReturnToChoice,
  onClose,
  onViewChange,
  onOpenOnRamp,
}: WalletFundingModalProps) {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open, view]);

  if (!open) return null;

  const title =
    view === "deposit"
      ? `Deposit ${pumpChain.nativeCurrency.symbol}`
      : (options.title ?? "Add funds");

  const description =
    view === "deposit"
      ? `Send native ${pumpChain.nativeCurrency.symbol} to your connected wallet on ${pumpChain.name}.`
      : (options.message ??
        `Choose how you want to fund your wallet on ${FUNDING_CHAIN_LABEL}.`);

  async function onCopyAddress() {
    if (!address) return;
    const ok = await copyToClipboard(address);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  function openDepositView() {
    onViewChange("deposit");
  }

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss z-[110] cursor-default transition-opacity"
          aria-label="Close"
          onClick={onClose}
        />
        <div
          className="modal-sheet-host z-[111]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-funding-title"
        >
          <div className="modal-panel modal-sheet-panel max-w-md rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:border-x sm:border-b sm:p-5">
            <div className="flex items-start justify-between gap-3 border-b border-pump-border/45 pb-3">
              <div className="min-w-0">
                {view === "deposit" && canReturnToChoice ? (
                  <button
                    type="button"
                    onClick={() => onViewChange("choice")}
                    className="mb-2 inline-flex items-center gap-1 text-caption text-pump-muted transition hover:text-pump-text"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                    Back
                  </button>
                ) : null}
                <h2 id="wallet-funding-title" className="text-h3 font-semibold text-pump-text">
                  {title}
                </h2>
                <p className="mt-0.5 text-caption text-pump-muted">{description}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {view === "choice" ? (
              <div className="mt-4 space-y-2.5">
                <button type="button" onClick={openDepositView} className="wallet-fund-option">
                  <span className="wallet-fund-option-icon">
                    <QrCode className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-pump-text">
                      Deposit on-chain
                    </span>
                    <span className="mt-0.5 block text-caption leading-snug text-pump-muted">
                      Transfer {pumpChain.nativeCurrency.symbol} from another wallet or exchange to
                      your address on {pumpChain.name}.
                    </span>
                  </span>
                </button>

                <button type="button" onClick={onOpenOnRamp} className="wallet-fund-option">
                  <span className="wallet-fund-option-icon">
                    <CreditCard className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-pump-text">
                      Buy with card
                    </span>
                    <span className="mt-0.5 block text-caption leading-snug text-pump-muted">
                      Purchase {pumpChain.nativeCurrency.symbol} via card, Apple Pay, or bank
                      transfer through our on-ramp partners.
                    </span>
                  </span>
                </button>

                <p className="pt-1 text-caption text-pump-muted">
                  On-ramp availability and payment methods depend on your region and connected
                  wallet type.
                </p>
              </div>
            ) : address ? (
              <div className="mt-4">
                <div className="flex flex-col items-center">
                  <DepositQrCode address={address} />
                  <p className="mt-3 text-caption text-pump-muted">Scan to copy wallet address</p>
                </div>

                <div className="mt-4">
                  <p className="section-label">Your wallet address</p>
                  <div className="share-sheet-copy-row mt-1.5">
                    <p className="share-sheet-copy-url font-mono text-body-sm" title={address}>
                      {address}
                    </p>
                    <button
                      type="button"
                      onClick={() => void onCopyAddress()}
                      className="share-sheet-copy-button"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-pump-success" strokeWidth={2.25} aria-hidden />
                      ) : (
                        <Copy className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                      )}
                      <span>{copied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border border-pump-border/45 bg-pump-border/4 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-caption text-pump-muted">
                    <Wallet className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                    Network
                  </span>
                  <span className="text-body-sm font-semibold text-pump-text">
                    {FUNDING_CHAIN_LABEL}
                  </span>
                </div>

                <ul className="mt-4 space-y-2">
                  {DEPOSIT_WARNINGS.map((warning) => (
                    <li key={warning} className="notice-warning leading-snug">
                      {warning}
                    </li>
                  ))}
                </ul>

                <a
                  href={explorerAddressUrl(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex text-caption text-pump-accent transition hover:underline"
                >
                  View address on {pumpChain.blockExplorers.default.name}
                </a>
              </div>
            ) : (
              <p className="notice-warning mt-4">Connect a wallet to see your deposit address.</p>
            )}

            {view === "deposit" ? (
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={onOpenOnRamp} className="secondary-button w-full">
                  Buy with card
                </button>
                <button type="button" onClick={onClose} className="primary-button w-full">
                  Done
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </>
    </ModalPortal>
  );
}

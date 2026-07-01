"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { pumpChain, shortAddress } from "@/config/chain";
import { FUNDING_CHAIN_LABEL } from "@/lib/wallet-funding";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { WithdrawForm } from "@/components/wallet/WithdrawForm";
import type { WalletFundingOptions, WalletFundingView } from "@/components/wallet/WalletFundingProvider";
import { startScwDepositWatch } from "@/lib/scw-balance-sync";
import { PumpIcon, faArrowLeft, faArrowUpRight, faCopy, faWallet, faX } from "@/lib/icons";

type WalletFundingModalProps = {
  open: boolean;
  view: WalletFundingView;
  options: WalletFundingOptions;
  canReturnToChoice: boolean;
  onClose: () => void;
  onViewChange: (view: WalletFundingView) => void;
};

function FundingSheetFrame({
  title,
  subtitle,
  canReturnToChoice,
  onBack,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  canReturnToChoice?: boolean;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-sheet app-sheet--funding">
      <div className="app-sheet__grab" aria-hidden />
      <div className="app-sheet__header">
        <div className="app-sheet__header-main">
          {canReturnToChoice && onBack ? (
            <button type="button" onClick={onBack} className="app-sheet__back" aria-label="Back">
              <PumpIcon icon={faArrowLeft} className="h-4 w-4" />
            </button>
          ) : null}
          <div className="min-w-0">
            <h2 className="app-sheet__title">{title}</h2>
            {subtitle ? <p className="app-sheet__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <button type="button" onClick={onClose} className="app-sheet__close" aria-label="Close">
          <PumpIcon icon={faX} className="h-4 w-4" />
        </button>
      </div>
      <div className="app-sheet__body">{children}</div>
    </div>
  );
}

function DepositView({ address, onClose }: { address: string; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    startScwDepositWatch();
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(address, { margin: 1, width: 220 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function onCopy() {
    const ok = await copyToClipboard(address);
    setCopied(ok);
    if (ok) {
      startScwDepositWatch();
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="wallet-funding-deposit">
      <p className="wallet-funding-deposit__hint">
        Scan or copy your smart wallet address. Funds appear after on-chain confirmation on{" "}
        {FUNDING_CHAIN_LABEL}.
      </p>

      <div className="wallet-funding-deposit__qr panel-surface">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Deposit address QR code" className="wallet-funding-deposit__qr-img" />
        ) : (
          <div className="wallet-funding-deposit__qr-placeholder">Generating QR…</div>
        )}
      </div>

      <div className="wallet-funding-deposit__address panel-surface">
        <span className="financial-value wallet-funding-deposit__address-text">{shortAddress(address)}</span>
        <button type="button" onClick={() => void onCopy()} className="secondary-button wallet-funding-deposit__copy">
          <PumpIcon icon={faCopy} className="h-3.5 w-3.5 shrink-0" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <button type="button" onClick={onClose} className="primary-button w-full">
        Done
      </button>
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
}: WalletFundingModalProps) {
  const { authenticated, scwAddress } = usePumpWallet();

  useEffect(() => {
    if (open && view === "deposit") {
      startScwDepositWatch();
    }
  }, [open, view]);

  if (!open) return null;

  const title =
    view === "withdraw"
      ? "Withdraw"
      : view === "deposit"
        ? `Deposit ${pumpChain.nativeCurrency.symbol}`
        : (options.title ?? "Add funds");

  const subtitle =
    view === "withdraw"
      ? "Send assets to an external wallet address."
      : view === "deposit"
        ? `Smart wallet on ${FUNDING_CHAIN_LABEL}.`
        : (options.message ?? `Fund your wallet on ${FUNDING_CHAIN_LABEL}.`);

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss z-[110] cursor-default transition-opacity"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="modal-sheet-host z-[111]" role="dialog" aria-modal="true" aria-labelledby="wallet-funding-title">
          <div className="modal-panel modal-sheet-panel app-sheet-host-panel pointer-events-auto max-w-md rounded-t-2xl border-x-0 border-b-0 sm:rounded-xl sm:border-x sm:border-b">
            <FundingSheetFrame
              title={title}
              subtitle={subtitle}
              canReturnToChoice={(view === "withdraw" || view === "deposit") && canReturnToChoice}
              onBack={() => onViewChange("choice")}
              onClose={onClose}
            >
              {view === "choice" ? (
                <div className="wallet-funding-choice">
                  <button type="button" onClick={() => onViewChange("deposit")} className="wallet-funding-choice__item panel-surface">
                    <span className="wallet-funding-choice__icon">
                      <PumpIcon icon={faWallet} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-body-sm font-semibold text-pump-text">Deposit</span>
                      <span className="mt-0.5 block text-caption leading-snug text-pump-muted">
                        Receive {pumpChain.nativeCurrency.symbol} to your smart wallet.
                      </span>
                    </span>
                  </button>

                  <button type="button" onClick={() => onViewChange("withdraw")} className="wallet-funding-choice__item panel-surface">
                    <span className="wallet-funding-choice__icon">
                      <PumpIcon icon={faArrowUpRight} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-body-sm font-semibold text-pump-text">Withdraw</span>
                      <span className="mt-0.5 block text-caption leading-snug text-pump-muted">
                        Send {pumpChain.nativeCurrency.symbol} or tokens to an external address.
                      </span>
                    </span>
                  </button>
                </div>
              ) : view === "deposit" ? (
                authenticated && scwAddress ? (
                  <DepositView address={scwAddress} onClose={onClose} />
                ) : (
                  <p className="notice-warning">Sign in to view your deposit address.</p>
                )
              ) : authenticated ? (
                <WithdrawForm onClose={onClose} />
              ) : (
                <p className="notice-warning">Sign in to withdraw.</p>
              )}
            </FundingSheetFrame>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}

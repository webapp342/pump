"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { pumpChain, shortAddress } from "@/config/chain";
import { FUNDING_CHAIN_LABEL } from "@/lib/wallet-funding";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { WithdrawForm } from "@/components/wallet/WithdrawForm";
import type { WalletFundingOptions, WalletFundingView } from "@/components/wallet/WalletFundingProvider";
import { startScwDepositWatch } from "@/lib/scw-balance-sync";
import { PumpIcon, faArrowLeft, faArrowUpRight, faCheck, faChevronRight, faCopy, faWallet } from "@/lib/icons";

type WalletFundingModalProps = {
  open: boolean;
  view: WalletFundingView;
  options: WalletFundingOptions;
  canReturnToChoice: boolean;
  onClose: () => void;
  onViewChange: (view: WalletFundingView) => void;
};

function DepositView({ address }: { address: string }) {
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

      <div className="wallet-funding-deposit__qr">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Deposit address QR code" className="wallet-funding-deposit__qr-img" />
        ) : (
          <div className="wallet-funding-deposit__qr-placeholder">Generating QR…</div>
        )}
      </div>

      <div className="wallet-funding-deposit__address">
        <span className="financial-value wallet-funding-deposit__address-text">{shortAddress(address)}</span>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="wallet-funding-deposit__copy"
          aria-label={copied ? "Address copied" : "Copy deposit address"}
        >
          <PumpIcon icon={copied ? faCheck : faCopy} className="h-3.5 w-3.5 shrink-0" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
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
  const [withdrawUi, setWithdrawUi] = useState({ pending: false, canSubmit: false });

  useEffect(() => {
    if (open && view === "deposit") {
      startScwDepositWatch();
    }
  }, [open, view]);

  useEffect(() => {
    if (view !== "withdraw") {
      setWithdrawUi({ pending: false, canSubmit: false });
    }
  }, [view]);

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

  const showBack = (view === "withdraw" || view === "deposit") && canReturnToChoice;

  const footer =
    view === "withdraw" ? (
      <div className="wallet-funding-withdraw__actions">
        <button
          type="button"
          onClick={onClose}
          className="secondary-button w-full"
          disabled={withdrawUi.pending}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="pump-withdraw-form"
          className="primary-button w-full"
          disabled={withdrawUi.pending || !withdrawUi.canSubmit}
        >
          {withdrawUi.pending ? "Sending…" : "Withdraw"}
        </button>
      </div>
    ) : view === "deposit" && authenticated && scwAddress ? (
      <button type="button" onClick={onClose} className="primary-button w-full">
        Done
      </button>
    ) : null;

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={title}
      title={title}
      subtitle={subtitle}
      zIndex={110}
      panelClassName="max-w-md"
      bodyClassName="wallet-funding-sheet__body"
      headerLeading={
        showBack ? (
          <button
            type="button"
            onClick={() => onViewChange("choice")}
            className="app-bottom-sheet__back"
            aria-label="Back"
          >
            <PumpIcon icon={faArrowLeft} className="h-4 w-4" />
          </button>
        ) : null
      }
      footer={footer}
    >
      {view === "choice" ? (
        <nav className="wallet-funding-choice" aria-label="Funding options">
          <button type="button" onClick={() => onViewChange("deposit")} className="wallet-funding-choice__item">
            <PumpIcon icon={faWallet} className="wallet-funding-choice__icon" aria-hidden />
            <span className="wallet-funding-choice__copy">
              <span className="wallet-funding-choice__label">Deposit</span>
              <span className="wallet-funding-choice__desc">
                Receive {pumpChain.nativeCurrency.symbol} to your smart wallet.
              </span>
            </span>
            <PumpIcon icon={faChevronRight} className="wallet-funding-choice__chevron" aria-hidden />
          </button>

          <button type="button" onClick={() => onViewChange("withdraw")} className="wallet-funding-choice__item">
            <PumpIcon icon={faArrowUpRight} className="wallet-funding-choice__icon" aria-hidden />
            <span className="wallet-funding-choice__copy">
              <span className="wallet-funding-choice__label">Withdraw</span>
              <span className="wallet-funding-choice__desc">
                Send {pumpChain.nativeCurrency.symbol} or tokens to an external address.
              </span>
            </span>
            <PumpIcon icon={faChevronRight} className="wallet-funding-choice__chevron" aria-hidden />
          </button>
        </nav>
      ) : view === "deposit" ? (
        authenticated && scwAddress ? (
          <DepositView address={scwAddress} />
        ) : (
          <p className="wallet-funding-sheet__notice notice-warning">Sign in to view your deposit address.</p>
        )
      ) : authenticated ? (
        <WithdrawForm
          onClose={onClose}
          hideActions
          formId="pump-withdraw-form"
          onUiChange={setWithdrawUi}
        />
      ) : (
        <p className="wallet-funding-sheet__notice notice-warning">Sign in to withdraw.</p>
      )}
    </AppBottomSheet>
  );
}

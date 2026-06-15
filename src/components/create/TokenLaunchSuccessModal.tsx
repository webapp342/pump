"use client";

import { TokenAvatar } from "@/components/token/TokenAvatar";
import { shortAddress } from "@/config/chain";
import { ModalPortal } from "@/components/ui/ModalPortal";

type TokenLaunchSuccessModalProps = {
  open: boolean;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  logoPreviewUrl?: string | null;
  onCreateAirdrop: () => void;
  onViewToken: () => void;
  onDismiss: () => void;
};

export function TokenLaunchSuccessModal({
  open,
  tokenAddress,
  tokenName,
  tokenSymbol,
  logoPreviewUrl,
  onCreateAirdrop,
  onViewToken,
  onDismiss,
}: TokenLaunchSuccessModalProps) {
  return (
    <ModalPortal open={open}>
      <div
        className="modal-backdrop modal-backdrop-shell z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-launch-success-title"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close"
          onClick={onDismiss}
        />
        <div className="modal-panel relative w-full max-w-md p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 border-b border-pump-border/45 pb-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pump-accent/15 text-pump-accent"
                aria-hidden
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 id="token-launch-success-title" className="text-h3 font-semibold text-pump-text">
                  Token launched
                </h2>
                <p className="mt-0.5 text-caption text-pump-muted">
                  Your coin is live on the bonding curve.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-lg border border-pump-border/30 bg-pump-card-soft/40 px-3 py-3">
            <TokenAvatar
              address={tokenAddress}
              symbol={tokenSymbol}
              previewUrl={logoPreviewUrl}
              size={44}
            />
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-pump-text">{tokenName}</p>
              <p className="font-mono text-caption text-pump-muted">
                ${tokenSymbol}
                <span className="mx-1.5 text-pump-border">·</span>
                {shortAddress(tokenAddress, true)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-pump-accent/30 bg-pump-accent/8 px-4 py-3">
            <p className="text-body-sm font-semibold text-pump-text">Next step: boost visibility</p>
            <p className="mt-1.5 text-caption leading-relaxed text-pump-muted">
              Tokens with an active airdrop campaign reach more traders, build a holder base faster, and
              rank higher across Explore and Airdrops. Most successful launches run one within the first
              hour.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <button type="button" onClick={onCreateAirdrop} className="primary-button w-full py-2.5">
              Create airdrop
            </button>
            <button type="button" onClick={onViewToken} className="secondary-button w-full py-2.5">
              View token page
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

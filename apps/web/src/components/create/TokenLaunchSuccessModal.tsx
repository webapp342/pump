"use client";

import { PumpIcon, faCheck } from "@/lib/icons";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { shortAddress } from "@/config/chain";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";

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
    <AppBottomSheet
      open={open}
      onClose={onDismiss}
      ariaLabel="Token launched"
      title="Token launched"
      subtitle="Your coin is live on the bonding curve."
      zIndex={50}
      panelClassName="max-w-md"
      headerLeading={
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pump-accent/15 text-pump-accent"
          aria-hidden
        >
          <PumpIcon icon={faCheck} className="h-[18px] w-[18px]" />
        </span>
      }
      footer={
        <div className="space-y-2">
          <button type="button" onClick={onCreateAirdrop} className="primary-button w-full py-2.5">
            Create airdrop
          </button>
          <button type="button" onClick={onViewToken} className="secondary-button w-full py-2.5">
            View token page
          </button>
        </div>
      }
    >
          <div className="flex items-center gap-3 rounded-lg border border-pump-border/30 bg-pump-card-soft/40 px-3 py-3">
            <TokenAvatar
              address={tokenAddress}
              symbol={tokenSymbol}
              previewUrl={logoPreviewUrl}
              size="3xl"
            />
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-pump-text">{tokenName}</p>
              <p className="font-mono text-caption text-pump-muted">
                {tokenSymbol}
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

    </AppBottomSheet>
  );
}

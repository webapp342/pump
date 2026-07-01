"use client";

import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { PortfolioFeesBreakdown } from "@/components/portfolio/PortfolioFeesBreakdown";
import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { PumpIcon, faInviteLink } from "@/lib/icons";
import { referralSharePayload } from "@/lib/share-links";

type ReferralRewardsCardProps = {
  address: string;
  claimedBnb: number;
  pendingWei: bigint | undefined;
  bnbUsd: number | null;
  onOpenModal: () => void;
  className?: string;
};

export function ReferralRewardsCard({
  address,
  claimedBnb,
  pendingWei,
  bnbUsd,
  onOpenModal,
  className = "",
}: ReferralRewardsCardProps) {
  const [shareOpen, setShareOpen] = useState(false);

  const pendingBnb = pendingWei != null ? Number(formatEther(pendingWei)) : 0;
  const sharePayload = useMemo(() => referralSharePayload(address), [address]);

  return (
    <>
      <PortfolioMetricBox
        className={className}
        label="Referral fees"
        value={
          <PortfolioFeesBreakdown
            availableBnb={pendingBnb}
            claimedBnb={claimedBnb}
            bnbUsd={bnbUsd}
          />
        }
        valueClassName=""
        actionsLayout="split"
        actionsInlineFromMd
        actions={
          <>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="secondary-button inline-flex items-center justify-center gap-1.5"
            >
              <PumpIcon icon={faInviteLink} className="h-3.5 w-3.5 shrink-0 opacity-80" />
              Share
            </button>
            <button type="button" onClick={onOpenModal} className="secondary-button">
              Claim
            </button>
          </>
        }
      />

      <ShareSheetModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        payload={sharePayload}
        title="Share invite"
        description="Friends must open your link before their first trade."
      />
    </>
  );
}

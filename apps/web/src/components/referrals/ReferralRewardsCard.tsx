"use client";

import { useMemo, useState } from "react";
import { PortfolioEarningsCard } from "@/components/portfolio/PortfolioEarningsCard";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { PumpIcon, faInviteLink } from "@/lib/icons";
import { PORTFOLIO_EARNINGS_CARD_LABELS } from "@/lib/portfolio-tabs";
import { referralSharePayload } from "@/lib/share-links";

type ReferralRewardsCardProps = {
  address: string;
  claimedBnb: number;
  /** Pending native amount in whole units (BNB / SOL), not wei/lamports. */
  pendingBnb: number;
  bnbUsd: number | null;
  onOpenModal: () => void;
  className?: string;
};

export function ReferralRewardsCard({
  address,
  claimedBnb,
  pendingBnb,
  bnbUsd,
  onOpenModal,
  className = "",
}: ReferralRewardsCardProps) {
  const [shareOpen, setShareOpen] = useState(false);

  const sharePayload = useMemo(() => referralSharePayload(address), [address]);

  return (
    <>
      <PortfolioEarningsCard
        className={className}
        title={PORTFOLIO_EARNINGS_CARD_LABELS.referral}
        description="When friends trade through your invite link."
        availableBnb={pendingBnb}
        claimedBnb={claimedBnb}
        bnbUsd={bnbUsd}
        onClaim={onOpenModal}
        secondaryAction={
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="secondary-button inline-flex items-center justify-center gap-1.5"
          >
            <PumpIcon icon={faInviteLink} className="h-3.5 w-3.5 shrink-0 opacity-80" />
            Share
          </button>
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

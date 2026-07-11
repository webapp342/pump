"use client";

import { CreatorFeesCard } from "@/components/portfolio/CreatorFeesCard";
import { ReferralRewardsCard } from "@/components/referrals/ReferralRewardsCard";

type PortfolioFeesTabProps = {
  walletAddress: string;
  creatorClaimedBnb: number;
  creatorPendingBnb: number;
  bnbUsd: number | null;
  onOpenCreatorClaim: () => void;
  referralClaimedBnb: number;
  pendingReferrerWei: bigint | undefined;
  onOpenReferrerClaim: () => void;
};

export function PortfolioFeesTab({
  walletAddress,
  creatorClaimedBnb,
  creatorPendingBnb,
  bnbUsd,
  onOpenCreatorClaim,
  referralClaimedBnb,
  pendingReferrerWei,
  onOpenReferrerClaim,
}: PortfolioFeesTabProps) {
  return (
    <div className="portfolio-earnings-tab">
      <div className="portfolio-earnings-tab__stack">
        <CreatorFeesCard
          claimedBnb={creatorClaimedBnb}
          pendingBnb={creatorPendingBnb}
          bnbUsd={bnbUsd}
          onOpenModal={onOpenCreatorClaim}
          className="portfolio-earnings-tab__card"
        />
        <ReferralRewardsCard
          address={walletAddress}
          claimedBnb={referralClaimedBnb}
          pendingWei={pendingReferrerWei}
          bnbUsd={bnbUsd}
          onOpenModal={onOpenReferrerClaim}
          className="portfolio-earnings-tab__card"
        />
      </div>
    </div>
  );
}

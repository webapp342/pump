"use client";

import { CreatorFeesCard } from "@/components/portfolio/CreatorFeesCard";
import { ReferralRewardsCard } from "@/components/referrals/ReferralRewardsCard";
import { PortfolioAirdropsSection } from "@/components/portfolio/PortfolioAirdropsSection";

type PortfolioRewardsTabProps = {
  walletAddress: string;
  creatorFeesTotalBnb: number;
  bnbUsd: number | null;
  onOpenCreatorClaim: () => void;
  referralClaimedBnb: number;
  pendingReferrerWei: bigint | undefined;
  onOpenReferrerClaim: () => void;
};

export function PortfolioRewardsTab({
  walletAddress,
  creatorFeesTotalBnb,
  bnbUsd,
  onOpenCreatorClaim,
  referralClaimedBnb,
  pendingReferrerWei,
  onOpenReferrerClaim,
}: PortfolioRewardsTabProps) {
  return (
    <div className="portfolio-rewards-tab">
      <div className="portfolio-rewards-tab__grid">
        <CreatorFeesCard
          totalBnb={creatorFeesTotalBnb}
          bnbUsd={bnbUsd}
          onOpenModal={onOpenCreatorClaim}
          className="portfolio-rewards-tab__card"
        />
        <ReferralRewardsCard
          address={walletAddress}
          claimedBnb={referralClaimedBnb}
          pendingWei={pendingReferrerWei}
          bnbUsd={bnbUsd}
          onOpenModal={onOpenReferrerClaim}
          className="portfolio-rewards-tab__card"
        />
      </div>
      <PortfolioAirdropsSection address={walletAddress} embedded />
    </div>
  );
}

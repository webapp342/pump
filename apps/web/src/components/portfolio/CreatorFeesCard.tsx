"use client";

import { PortfolioEarningsCard } from "@/components/portfolio/PortfolioEarningsCard";
import { PORTFOLIO_EARNINGS_CARD_LABELS } from "@/lib/portfolio-tabs";

type CreatorFeesCardProps = {
  claimedBnb: number;
  pendingBnb: number;
  bnbUsd: number | null;
  onOpenModal: () => void;
  className?: string;
};

export function CreatorFeesCard({
  claimedBnb,
  pendingBnb,
  bnbUsd,
  onOpenModal,
  className = "",
}: CreatorFeesCardProps) {
  return (
    <PortfolioEarningsCard
      className={className}
      title={PORTFOLIO_EARNINGS_CARD_LABELS.creator}
      description="From tokens you launched on the bonding curve."
      availableBnb={pendingBnb}
      claimedBnb={claimedBnb}
      bnbUsd={bnbUsd}
      onClaim={onOpenModal}
    />
  );
}

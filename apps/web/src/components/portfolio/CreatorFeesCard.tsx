"use client";

import { PortfolioFeesBreakdown } from "@/components/portfolio/PortfolioFeesBreakdown";
import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";

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
    <PortfolioMetricBox
      className={className}
      label="Creator fees"
      value={
        <PortfolioFeesBreakdown
          availableBnb={pendingBnb}
          claimedBnb={claimedBnb}
          bnbUsd={bnbUsd}
        />
      }
      valueClassName=""
      actionsInlineFromMd
      actions={
        <button type="button" onClick={onOpenModal} className="secondary-button">
          Claim
        </button>
      }
    />
  );
}

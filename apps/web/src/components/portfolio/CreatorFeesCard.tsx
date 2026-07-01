"use client";

import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";

type CreatorFeesCardProps = {
  totalBnb: number;
  bnbUsd: number | null;
  onOpenModal: () => void;
  className?: string;
};

export function CreatorFeesCard({
  totalBnb,
  bnbUsd,
  onOpenModal,
  className = "",
}: CreatorFeesCardProps) {
  const totalUsd = bnbToUsd(totalBnb, bnbUsd);

  return (
    <PortfolioMetricBox
      className={className}
      label="Creator fees"
      value={formatUsdReadable(totalUsd, { compact: true })}
      actionsInlineFromMd
      actions={
        <button type="button" onClick={onOpenModal} className="secondary-button">
          Claim
        </button>
      }
    />
  );
}

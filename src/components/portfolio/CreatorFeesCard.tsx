"use client";

import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";

type CreatorFeesCardProps = {
  totalBnb: number;
  bnbUsd: number | null;
  onOpenModal: () => void;
};

export function CreatorFeesCard({ totalBnb, bnbUsd, onOpenModal }: CreatorFeesCardProps) {
  const totalUsd = bnbToUsd(totalBnb, bnbUsd);

  return (
    <PortfolioMetricBox
      label="Creator fees"
      value={formatUsdReadable(totalUsd, { compact: true })}
      actions={
        <button type="button" onClick={onOpenModal} className="primary-button">
          Claim
        </button>
      }
    />
  );
}

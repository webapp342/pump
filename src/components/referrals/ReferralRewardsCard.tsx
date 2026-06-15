"use client";

import { Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { ICON_STROKE } from "@/lib/icons";
import { referralSharePayload } from "@/lib/share-links";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";

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
  const totalBnb = claimedBnb + pendingBnb;
  const totalUsd = bnbToUsd(totalBnb, bnbUsd);
  const sharePayload = useMemo(() => referralSharePayload(address), [address]);

  return (
    <>
      <PortfolioMetricBox
        className={className}
        label="Referral fees"
        value={formatUsdReadable(totalUsd, { compact: true })}
        actionsLayout="split"
        actionsInlineFromMd
        actions={
          <>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="secondary-button inline-flex items-center justify-center gap-1.5"
            >
              <Share2 className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              Share
            </button>
            <button type="button" onClick={onOpenModal} className="primary-button">
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

"use client";

import { useCallback, useState } from "react";
import { formatEther } from "viem";
import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";
import { buildReferralInviteUrl } from "@/lib/referral-link";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";

type ReferralRewardsCardProps = {
  address: string;
  claimedBnb: number;
  pendingWei: bigint | undefined;
  bnbUsd: number | null;
  onOpenModal: () => void;
};

export function ReferralRewardsCard({
  address,
  claimedBnb,
  pendingWei,
  bnbUsd,
  onOpenModal,
}: ReferralRewardsCardProps) {
  const [copied, setCopied] = useState(false);

  const pendingBnb = pendingWei != null ? Number(formatEther(pendingWei)) : 0;
  const totalBnb = claimedBnb + pendingBnb;
  const totalUsd = bnbToUsd(totalBnb, bnbUsd);
  const inviteUrl = buildReferralInviteUrl(address);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [inviteUrl]);

  return (
    <PortfolioMetricBox
      label="Referral fees"
      value={formatUsdReadable(totalUsd, { compact: true })}
      actionsLayout="split"
      actions={
        <>
          <button type="button" onClick={() => void copyLink()} className="secondary-button">
            {copied ? "Copied" : "Copy link"}
          </button>
          <button type="button" onClick={onOpenModal} className="primary-button">
            Claim
          </button>
        </>
      }
    />
  );
}

"use client";

import { useMemo } from "react";
import { getAirdropDistributionTiers, formatPerWinnerSharePct } from "@/lib/airdrop-distribution";
import { formatCampaignAmount } from "@/lib/airdrop-board-format";
import {
  BnbAssetChip,
  TokenAssetChip,
} from "@/components/token/AssetAmountDisplay";

type RewardTokenMeta = {
  address: string;
  symbol: string;
  logoUrl?: string | null;
};

type AirdropRewardSplitPreviewProps = {
  totalReward: bigint | null;
  assetLabel: string;
  isBnb?: boolean;
  rewardToken?: RewardTokenMeta | null;
};

function TierRewardCell({
  amount,
  isBnb,
  rewardToken,
  assetLabel,
  perWinner,
}: {
  amount: string;
  isBnb: boolean;
  rewardToken?: RewardTokenMeta | null;
  assetLabel: string;
  perWinner?: boolean;
}) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className="financial-value tabular-nums text-pump-text">{amount}</span>
      {isBnb ? (
        <BnbAssetChip size="xs" />
      ) : rewardToken ? (
        <TokenAssetChip
          address={rewardToken.address}
          symbol={rewardToken.symbol}
          logoUrl={rewardToken.logoUrl}
          size={12}
        />
      ) : (
        <span className="text-caption text-pump-muted">{assetLabel}</span>
      )}
      {perWinner ? <span className="text-caption text-pump-muted">/ea</span> : null}
    </span>
  );
}

export function AirdropRewardSplitPreview({
  totalReward,
  assetLabel,
  isBnb = false,
  rewardToken = null,
}: AirdropRewardSplitPreviewProps) {
  const tiers = useMemo(
    () => getAirdropDistributionTiers(totalReward ?? 0n),
    [totalReward]
  );

  const hasAmount = totalReward != null && totalReward > 0n;
  const eachPctLabel = formatPerWinnerSharePct();

  return (
    <section className="panel-surface p-4 md:p-5">
      <p className="section-label">TOP 100 split</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[260px] text-caption">
          <thead>
            <tr className="border-b border-pump-border/15 text-left text-pump-muted">
              <th className="pb-2 pr-3 font-medium">Rank</th>
              <th className="pb-2 pr-3 font-medium">Share</th>
              <th className="pb-2 text-right font-medium">Reward</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pump-border/10">
            {tiers.map((tier) => (
              <tr key={tier.rankLabel}>
                <td className="py-2 pr-3 font-medium text-pump-text">{tier.rankLabel}</td>
                <td className="py-2 pr-3 text-pump-muted">
                  {tier.perWinner
                    ? `${tier.poolSharePct}% · ${eachPctLabel}% ea`
                    : `${tier.poolSharePct}%`}
                </td>
                <td className="py-2 text-right">
                  {hasAmount ? (
                    <TierRewardCell
                      amount={formatCampaignAmount(tier.amount)}
                      isBnb={isBnb}
                      rewardToken={rewardToken}
                      assetLabel={assetLabel}
                      perWinner={tier.perWinner}
                    />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-pump-muted">
        Ranks #4–#100 share 70% equally.
      </p>
    </section>
  );
}

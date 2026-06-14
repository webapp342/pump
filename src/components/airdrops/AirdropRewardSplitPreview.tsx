"use client";

import { useMemo } from "react";
import { getAirdropDistributionTiers, formatPerWinnerSharePct } from "@/lib/airdrop-distribution";
import { formatCampaignAmount } from "@/lib/airdrop-board-format";

type AirdropRewardSplitPreviewProps = {
  totalReward: bigint | null;
  assetLabel: string;
};

export function AirdropRewardSplitPreview({
  totalReward,
  assetLabel,
}: AirdropRewardSplitPreviewProps) {
  const tiers = useMemo(
    () => getAirdropDistributionTiers(totalReward ?? 0n),
    [totalReward]
  );

  const hasAmount = totalReward != null && totalReward > 0n;
  const eachPctLabel = formatPerWinnerSharePct();

  return (
    <section className="panel-surface p-4">
      <p className="section-label">TOP 100 split</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-caption">
          <thead>
            <tr className="border-b border-pump-border/15 text-left text-pump-muted">
              <th className="pb-1.5 pr-2 font-medium">Rank</th>
              <th className="pb-1.5 pr-2 font-medium">Share</th>
              <th className="pb-1.5 text-right font-medium">Reward</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pump-border/10">
            {tiers.map((tier) => (
              <tr key={tier.rankLabel}>
                <td className="py-1.5 pr-2 font-medium text-pump-text">{tier.rankLabel}</td>
                <td className="py-1.5 pr-2 text-pump-muted">
                  {tier.perWinner
                    ? `${tier.poolSharePct}% · ${eachPctLabel}% ea`
                    : `${tier.poolSharePct}%`}
                </td>
                <td className="py-1.5 text-right financial-value text-pump-text">
                  {hasAmount ? (
                    <>
                      {formatCampaignAmount(tier.amount)}
                      <span className="text-pump-muted">
                        {" "}
                        {assetLabel}
                        {tier.perWinner ? "/ea" : ""}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-pump-muted">
        Ranks #4–#100 share 70% equally.
      </p>
    </section>
  );
}

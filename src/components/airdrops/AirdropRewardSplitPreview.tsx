"use client";

import { useMemo } from "react";
import { formatEther } from "viem";
import { getAirdropDistributionTiers, perWinnerSharePct } from "@/lib/airdrop-distribution";

function formatSplitAmount(value: bigint): string {
  const n = Number(formatEther(value));
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toFixed(8);
}

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
  const eachPct = perWinnerSharePct();

  return (
    <section className="panel-surface p-3 md:p-4">
      <p className="section-label">TOP 100 split</p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[240px] text-caption">
          <thead>
            <tr className="border-b border-pump-border/15 text-left text-pump-muted">
              <th className="section-label pb-1.5 pr-2 text-[10px] font-medium">Rank</th>
              <th className="section-label pb-1.5 pr-2 text-[10px] font-medium">Pool %</th>
              <th className="section-label pb-1.5 text-right text-[10px] font-medium">Reward</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pump-border/10">
            {tiers.map((tier) => (
              <tr key={tier.rankLabel}>
                <td className="py-1.5 pr-2 font-medium text-pump-text">{tier.rankLabel}</td>
                <td className="py-1.5 pr-2 text-pump-muted">
                  {tier.perWinner
                    ? `${tier.poolSharePct}% · ${eachPct.toFixed(2)}% ea`
                    : `${tier.poolSharePct}%`}
                </td>
                <td className="py-1.5 text-right financial-value whitespace-nowrap text-pump-text">
                  {hasAmount ? (
                    <>
                      {formatSplitAmount(tier.amount)}
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

      <p className="mt-1.5 text-[10px] leading-snug text-pump-muted">
        100 winners · #4–#100 share 70% equally
      </p>
    </section>
  );
}

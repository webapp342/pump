"use client";

import type { AirdropListItem, AirdropDetail } from "@/lib/db/airdrops";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { BnbLogo } from "@/components/token/BnbLogo";
import { HourglassIcon } from "@/components/ui/HourglassIcon";
import { airdropRewardUsd, formatAirdropReward } from "@/lib/airdrop-board-format";
import { formatUsdReadable } from "@/lib/format-usd";
import {
  airdropStatusBadgeClass,
  formatAirdropDisplayStatus,
  type AirdropDisplayStatus,
} from "@/lib/airdrop-status";

type RewardPoolMetricProps = {
  rewardToken: string | null;
  rewardSymbol?: string | null;
  totalFunded: string;
  bnbUsd: number | null;
};

export function AirdropRewardPoolMetric({
  rewardToken,
  rewardSymbol,
  totalFunded,
  bnbUsd,
}: RewardPoolMetricProps) {
  const isBnb = !rewardToken;
  const usd = airdropRewardUsd(
    { rewardToken, rewardSymbol, totalFunded },
    bnbUsd
  );

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {isBnb ? (
        <BnbLogo size={18} />
      ) : (
        <TokenAvatar
          address={rewardToken}
          symbol={rewardSymbol ?? "?"}
          size={18}
        />
      )}
      <div className="min-w-0 leading-tight">
        <p className="financial-value truncate text-caption font-semibold text-pump-text">
          {formatAirdropReward(totalFunded, { isBnb, symbol: rewardSymbol })}
        </p>
        {usd != null ? (
          <p className="truncate text-[11px] text-pump-muted">
            {formatUsdReadable(usd, { compact: true })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AirdropPoolTokenMetric({
  tokenAddress,
  symbol,
}: {
  tokenAddress: string;
  symbol: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TokenAvatar address={tokenAddress} symbol={symbol} size={18} />
      <span className="financial-value truncate text-caption font-semibold text-pump-text">
        {symbol}
      </span>
    </div>
  );
}

export function AirdropProgressMetric({
  timeLabel,
  progressPct,
  showBar = true,
  showIcon = true,
}: {
  timeLabel: string;
  progressPct?: number;
  showBar?: boolean;
  showIcon?: boolean;
}) {
  const pct =
    progressPct != null ? Math.max(0, Math.min(100, Math.round(progressPct))) : null;

  return (
    <div
      className={`airdrop-progress-metric${showBar && pct != null ? " airdrop-progress-metric--with-bar" : ""}`}
    >
      <div className="airdrop-progress-metric__head flex min-w-0 items-center gap-1 financial-value text-caption font-semibold tabular-nums text-pump-text">
        {showIcon ? <HourglassIcon size={13} className="shrink-0" /> : null}
        <span className="truncate">{timeLabel}</span>
      </div>
      {showBar && pct != null ? (
        <>
          <div className="airdrop-progress-metric__bar h-1 overflow-hidden rounded-full bg-pump-border/20">
            <div
              className="h-full rounded-full bg-pump-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="airdrop-progress-metric__pct financial-value shrink-0 text-caption tabular-nums text-pump-muted">
            {pct}%
          </span>
        </>
      ) : null}
    </div>
  );
}

export function AirdropParticipantsMetric({ count }: { count: number }) {
  return (
    <p className="financial-value text-caption font-semibold tabular-nums text-pump-text">
      {count.toLocaleString()}
    </p>
  );
}

export function AirdropStatusMetric({ status }: { status: AirdropDisplayStatus }) {
  return (
    <span
      className={`inline-flex text-[11px] font-semibold leading-none ${airdropStatusBadgeClass(status)}`}
    >
      {formatAirdropDisplayStatus(status)}
    </span>
  );
}

export function airdropListRewardProps(item: AirdropListItem, bnbUsd: number | null) {
  return {
    rewardToken: item.rewardToken,
    rewardSymbol: item.rewardSymbol,
    totalFunded: item.totalFunded,
    bnbUsd,
  };
}

export function airdropDetailRewardProps(detail: AirdropDetail, bnbUsd: number | null) {
  return {
    rewardToken: detail.rewardToken,
    rewardSymbol: detail.rewardSymbol,
    totalFunded: detail.totalFunded,
    bnbUsd,
  };
}

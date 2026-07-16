"use client";

import type { ReactNode } from "react";
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

function MetricValueStack({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="airdrop-metric-value">
      <div className="airdrop-metric-value__primary">{primary}</div>
      <div className="airdrop-metric-value__secondary">{secondary ?? <span aria-hidden>&nbsp;</span>}</div>
    </div>
  );
}

type RewardPoolMetricProps = {
  rewardToken: string | null;
  rewardSymbol?: string | null;
  rewardPriceBnb?: string | null;
  totalFunded: string;
  bnbUsd: number | null;
  showIcon?: boolean;
};

export function AirdropRewardPoolMetric({
  rewardToken,
  rewardSymbol,
  rewardPriceBnb,
  totalFunded,
  bnbUsd,
  showIcon = true,
  usdPrimary = false,
}: RewardPoolMetricProps & { usdPrimary?: boolean }) {
  const isBnb = !rewardToken;
  const usd = airdropRewardUsd(
    { rewardToken, rewardSymbol, rewardPriceBnb, totalFunded },
    bnbUsd
  );
  const amountLabel = formatAirdropReward(totalFunded, { isBnb, symbol: rewardSymbol });

  const primaryLabel =
    usdPrimary && usd != null ? formatUsdReadable(usd, { compact: true }) : amountLabel;
  const secondaryLabel =
    usdPrimary && usd != null ? amountLabel : usd != null ? formatUsdReadable(usd, { compact: true }) : null;

  return (
    <MetricValueStack
      primary={
        <div className="flex min-w-0 items-center gap-1.5">
          {showIcon && !usdPrimary ? (
            isBnb ? (
              <BnbLogo size="xs" className="shrink-0" />
            ) : (
              <TokenAvatar
                address={rewardToken}
                symbol={rewardSymbol ?? "?"}
                size="xs"
                className="shrink-0"
              />
            )
          ) : null}
          <span className="financial-value min-w-0 truncate text-caption font-semibold tabular-nums text-pump-text">
            {primaryLabel}
            {!usdPrimary && usd != null ? (
              <span className="font-medium text-pump-muted">
                {" "}
                · {formatUsdReadable(usd, { compact: true })}
              </span>
            ) : null}
          </span>
        </div>
      }
      secondary={
        secondaryLabel ? (
          <span className="financial-value truncate text-caption text-pump-muted">{secondaryLabel}</span>
        ) : undefined
      }
    />
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
    <MetricValueStack
      primary={
        <div className="flex min-w-0 items-center gap-1.5">
          <TokenAvatar address={tokenAddress} symbol={symbol} size="xs" className="shrink-0" />
          <span className="financial-value truncate text-caption font-semibold text-pump-text">
            {symbol}
          </span>
        </div>
      }
    />
  );
}

export function AirdropProgressMetric({
  timeLabel,
  progressPct,
  showBar = true,
  showIcon = true,
  showPct = true,
}: {
  timeLabel: string;
  progressPct?: number;
  showBar?: boolean;
  showIcon?: boolean;
  showPct?: boolean;
}) {
  const pct =
    progressPct != null ? Math.max(0, Math.min(100, Math.round(progressPct))) : null;

  return (
    <MetricValueStack
      primary={
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 financial-value text-caption font-semibold tabular-nums text-pump-text">
            {showIcon ? <HourglassIcon size={12} className="shrink-0" /> : null}
            <span className="truncate">{timeLabel}</span>
          </span>
          {showPct && pct != null ? (
            <span className="financial-value shrink-0 text-caption font-semibold tabular-nums text-pump-muted">
              {pct}%
            </span>
          ) : null}
        </div>
      }
      secondary={
        showBar && pct != null ? (
          <div className="h-1 w-full overflow-hidden rounded-full bg-pump-border/20">
            <div
              className="h-full rounded-full bg-pump-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : undefined
      }
    />
  );
}

export function AirdropParticipantsMetric({ count }: { count: number }) {
  return (
    <MetricValueStack
      primary={
        <p className="financial-value text-caption font-semibold tabular-nums text-pump-text">
          {count.toLocaleString()}
        </p>
      }
    />
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
    rewardPriceBnb: item.rewardPriceBnb,
    totalFunded: item.totalFunded,
    bnbUsd,
  };
}

export function airdropDetailRewardProps(detail: AirdropDetail, bnbUsd: number | null) {
  return {
    rewardToken: detail.rewardToken,
    rewardSymbol: detail.rewardSymbol,
    rewardPriceBnb: detail.rewardPriceBnb,
    totalFunded: detail.totalFunded,
    bnbUsd,
  };
}

"use client";

import Link from "next/link";
import { HourglassIcon } from "@/components/ui/HourglassIcon";
import { InfoTip } from "@/components/ui/InfoTip";
import { PageBackLink } from "@/components/ui/PageBackLink";
import {
  airdropDetailRewardProps,
} from "@/components/airdrops/AirdropMetricCells";
import { AirdropTrustBadge } from "@/components/airdrops/AirdropTrustBadge";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { parseEther } from "viem";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { contracts, NATIVE_SYMBOL, shortAddress } from "@/config/chain";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import type {
  AirdropDetail,
  AirdropProgress,
  AirdropSocialTask,
  LeaderboardRow,
  LeaderboardViewer,
  WinnerRow,
} from "@/lib/db/airdrops";
import {
  airdropStatusBadgeClass,
  formatAirdropDisplayStatus,
  getAirdropDisplayStatus,
  type AirdropDisplayStatus,
} from "@/lib/airdrop-status";
import {
  airdropRewardAmountUsd,
  airdropRewardUsd,
  formatAirdropReward,
  formatAirdropRewardCompact,
  formatDurationUntil,
  formatTimeRemaining,
  projectedRankRewardAmount,
  projectedRankRewardUsd,
} from "@/lib/airdrop-board-format";
import {
  openSocialTaskParticipantUrl,
  socialTaskActionLabel,
  socialTaskPreviewLabel,
} from "@/lib/airdrop-social";
import { AirdropDetailSkeleton } from "@/components/airdrops/AirdropsSkeleton";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";
import { CreatorProfileModal } from "@/components/creators/CreatorProfileModal";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { BnbLogo } from "@/components/token/BnbLogo";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { formatUsdReadable } from "@/lib/format-usd";
import {
  buildTokenTradeUrl,
  remainingRuleAmount,
} from "@/lib/token-trade-prefill";
import { AirdropSaveButton } from "@/components/airdrops/AirdropSaveButton";
import { PumpIcon } from "@/lib/icons";
import { MetricIcons } from "@/lib/metric-icons";

function formatAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function campaignTitle(detail: AirdropDetail): string {
  return (
    detail.title ??
    detail.linkedName ??
    detail.linkedSymbol ??
    shortAddress(detail.linkedToken)
  );
}

function poolSymbol(detail: AirdropDetail): string {
  return detail.linkedSymbol ?? shortAddress(detail.linkedToken);
}

function timeLeftLabel(status: AirdropDisplayStatus, detail: AirdropDetail): string {
  switch (status) {
    case "UPCOMING":
      return formatDurationUntil(detail.qualifyStart);
    case "QUALIFYING":
      return formatTimeRemaining(detail.qualifyEnd);
    case "FINALIZING":
      return "Finalizing winners…";
    case "CLAIMABLE":
      return detail.claimEnd ? formatTimeRemaining(detail.claimEnd) : "Claims open";
    case "CLOSED":
      return "Ended";
  }
}

function UpcomingTasksLockedNotice({
  qualifyStart,
  nowTick,
}: {
  qualifyStart: string;
  nowTick: number;
}) {
  return (
    <section className="airdrop-detail-section airdrop-detail-section--locked">
      <SectionHeader
        title="Tasks locked"
        hint="Social and on-chain steps unlock when qualification begins."
      />
      <div className="airdrop-detail-section__body">
        <p className="airdrop-detail-countdown" role="status" aria-live="polite">
          <HourglassIcon size={12} className="shrink-0 text-pump-accent" aria-hidden />
          <span>
            Opens in{" "}
            <span className="financial-value font-semibold tabular-nums text-pump-text">
              {nowTick >= 0 ? formatDurationUntil(qualifyStart) : "—"}
            </span>
          </span>
        </p>
      </div>
    </section>
  );
}

function AirdropDetailStatusStrip({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="airdrop-detail-status-strip" role="status">
      {children}
    </div>
  );
}

function AirdropToolbarStats({
  poolLabel,
  timeLabel,
  participantCount,
  showTime,
}: {
  poolLabel: string;
  timeLabel: string;
  participantCount: number;
  showTime: boolean;
}) {
  return (
    <div className="airdrop-toolbar-stats" role="list" aria-label="Campaign stats">
      <div className="airdrop-toolbar-stats__item" role="listitem" title="Reward pool">
        <PumpIcon icon={MetricIcons.rewardPool} className="airdrop-toolbar-stats__icon" aria-hidden />
        <span className="airdrop-toolbar-stats__value financial-value tabular-nums">{poolLabel}</span>
      </div>
      {showTime ? (
        <div className="airdrop-toolbar-stats__item" role="listitem" title="Time remaining">
          <PumpIcon icon={MetricIcons.progress} className="airdrop-toolbar-stats__icon" aria-hidden />
          <span className="airdrop-toolbar-stats__value financial-value tabular-nums">{timeLabel}</span>
        </div>
      ) : null}
      <div
        className="airdrop-toolbar-stats__item"
        role="listitem"
        title="Participants"
        aria-label={`Participants: ${participantCount.toLocaleString()}`}
      >
        <PumpIcon icon={MetricIcons.participants} className="airdrop-toolbar-stats__icon" aria-hidden />
        <span className="airdrop-toolbar-stats__value financial-value tabular-nums">
          {participantCount.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="airdrop-detail-section__head">
      <h2 className="airdrop-detail-section__title">{title}</h2>
      {hint ? <p className="airdrop-detail-section__hint">{hint}</p> : null}
    </header>
  );
}

function LeaderboardEmptyState({ ended }: { ended: boolean }) {
  return (
    <div className="airdrop-detail-empty" role="status">
      <p className="airdrop-detail-empty__title">
        {ended ? "No one ranked" : "Waiting for participants"}
      </p>
      <p className="airdrop-detail-empty__hint">
        {ended
          ? "This campaign ended without qualifiers on the leaderboard."
          : "Hold or buy the pool token during qualify to appear here. Projected rewards update live."}
      </p>
    </div>
  );
}

function TokenSymbolInline({
  address,
  symbol,
  size = "xs",
  className = "",
}: {
  address: string;
  symbol: string;
  size?: number | import("@/lib/ui-sizes").TokenLogoSizeRole;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <TokenAvatar address={address} symbol={symbol} size={size} className="shrink-0" />
      <span className="truncate font-medium text-pump-text">{symbol}</span>
    </span>
  );
}

function BnbRewardIcon({
  size = "xs",
}: {
  size?: number | import("@/lib/ui-sizes").TokenLogoSizeRole;
}) {
  return <BnbLogo size={size} />;
}

function StepTab({
  label,
  state,
  count,
}: {
  label: string;
  state: "done" | "active" | "locked" | "idle";
  count?: number;
}) {
  const active = state === "active";
  const done = state === "done";
  const locked = state === "locked";

  return (
    <span
      role="presentation"
      className={[
        "airdrops-tab-nav__item airdrop-detail-step-tab",
        active ? "airdrops-tab-nav__item--active" : "",
        done ? "airdrop-detail-step-tab--done" : "",
        locked ? "airdrop-detail-step-tab--locked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {done ? <span aria-hidden>✓ </span> : null}
      <span>{label}</span>
      {count != null && count > 0 ? (
        <span className="airdrops-tab-nav__count financial-value">{count}</span>
      ) : null}
    </span>
  );
}

function formatQualifyWindowLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RuleProgressRow({
  label,
  rule,
  unit,
  tokenAddress,
  buyMode,
  returnTo,
  tooltip,
  tooltipLabel = "About this requirement",
}: {
  label: ReactNode;
  rule: { current: string; target: string; met: boolean };
  unit: string;
  tokenAddress: string;
  buyMode: "bnb" | "token";
  returnTo?: string;
  tooltip?: ReactNode;
  tooltipLabel?: string;
}) {
  const href = buildTokenTradeUrl(tokenAddress, {
    buyMode,
    amount: rule.met ? undefined : remainingRuleAmount(rule.current, rule.target),
    met: rule.met,
    returnTo,
  });

  return (
    <li>
      <div
        className={`airdrop-detail-task-row airdrop-detail-task-row--onchain${
          rule.met ? " airdrop-detail-task-row--done" : ""
        }`}
      >
        <div className="airdrop-detail-onchain-task min-w-0">
          <div className="airdrop-detail-onchain-task__title-row">
            <span className="airdrop-detail-onchain-task__label text-body-sm font-medium text-pump-text">
              {label}
            </span>
            {tooltip ? (
              <InfoTip label={tooltipLabel} className="airdrop-detail-onchain-task__info shrink-0">
                {tooltip}
              </InfoTip>
            ) : null}
          </div>
          <span className="financial-value text-caption text-pump-muted">
            {formatAmount(rule.current)} / {formatAmount(rule.target)} {unit}
          </span>
        </div>
        <div className="airdrop-detail-task-row__action">
          {rule.met ? (
            <span className="airdrop-detail-task-status airdrop-detail-task-status--done">Met</span>
          ) : (
            <Link
              href={href}
              className="chip-button inline-flex shrink-0 items-center whitespace-nowrap px-2.5 py-1 text-caption"
            >
              Trade
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function SocialTaskRow({
  task,
  qualifyEnded,
  completing,
  onComplete,
}: {
  task: AirdropSocialTask;
  qualifyEnded: boolean;
  completing: boolean;
  onComplete: () => void;
}) {
  const done = task.completed;

  return (
    <li>
      <div
        className={`airdrop-detail-task-row ${
          done ? "airdrop-detail-task-row--done" : qualifyEnded ? "airdrop-detail-task-row--ended" : ""
        }`}
      >
        <span className="min-w-0 truncate text-body-sm font-medium text-pump-text">
          {socialTaskPreviewLabel(task.taskType, task.targetUrl)}
        </span>
        {done ? (
          <span className="airdrop-detail-task-status airdrop-detail-task-status--done">Done</span>
        ) : qualifyEnded ? (
          <span className="airdrop-detail-task-status">Ended</span>
        ) : (
          <button
            type="button"
            className="chip-button flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-caption"
            disabled={completing}
            onClick={onComplete}
          >
            {completing ? (
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
            ) : null}
            {completing ? "Saving…" : socialTaskActionLabel(task.taskType)}
          </button>
        )}
      </div>
    </li>
  );
}

function RewardCell({
  amount,
  usd,
  detail,
  compact = false,
  align = "right",
  showSymbol = true,
  showLabel = false,
  usdOnly = false,
}: {
  amount: string;
  usd: number | null;
  detail: Pick<AirdropDetail, "rewardToken" | "rewardSymbol">;
  compact?: boolean;
  align?: "left" | "right";
  showSymbol?: boolean;
  showLabel?: boolean;
  usdOnly?: boolean;
}) {
  const isBnb = !detail.rewardToken;
  const alignClass = align === "right" ? "text-right" : "text-left";
  const flexAlign = align === "right" ? "justify-end" : "justify-start";

  if (usdOnly) {
    return (
      <div className={`min-w-0 ${alignClass}`}>
        <p className="financial-value shrink-0 text-caption font-medium tabular-nums text-pump-text">
          {usd != null ? formatUsdReadable(usd, { compact: true }) : "—"}
        </p>
      </div>
    );
  }

  if (amount === "—") {
    return (
      <div className={`min-w-0 ${alignClass}`}>
        <p className="text-caption text-pump-muted">—</p>
      </div>
    );
  }

  const tokenBadge =
    showSymbol &&
    (isBnb ? (
      <span className="inline-flex shrink-0 items-center gap-1">
        <BnbRewardIcon size={compact ? 12 : 14} />
        <span className="text-caption font-medium text-pump-text">{NATIVE_SYMBOL}</span>
      </span>
    ) : (
      <TokenSymbolInline
        address={detail.rewardToken!}
        symbol={detail.rewardSymbol ?? "?"}
        size={compact ? 12 : 14}
        className="shrink-0 text-caption font-medium text-pump-text"
      />
    ));

  return (
    <div className={`min-w-0 ${alignClass}`}>
      <div
        className={`flex min-w-0 items-center gap-1 ${flexAlign} flex-nowrap ${compact ? "gap-1" : "gap-1.5"}`}
      >
        {showLabel ? (
          <span className="koth-banner__tag m-0 shrink-0">Reward</span>
        ) : null}
        <p className="financial-value shrink-0 text-caption font-medium tabular-nums text-pump-text">
          {amount}
        </p>
        {tokenBadge}
        {usd != null ? (
          <span className="financial-value shrink-0 text-caption tabular-nums text-pump-muted">
            · {formatUsdReadable(usd, { compact: true })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ClaimRewardAmount({
  amount,
  detail,
  size = "lg",
}: {
  amount: string;
  detail: AirdropDetail;
  size?: "lg" | "sm";
}) {
  const isBnb = !detail.rewardToken;
  const amountClass =
    size === "lg" ? "financial-value text-h3 font-semibold text-pump-text" : "financial-value font-semibold";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={amountClass}>{formatAmount(amount)}</span>
      {isBnb ? (
        <span className="inline-flex items-center gap-1.5 text-body-sm text-pump-muted">
          <BnbRewardIcon size={size === "lg" ? 20 : 16} />
          {NATIVE_SYMBOL}
        </span>
      ) : (
        <TokenSymbolInline
          address={detail.rewardToken!}
          symbol={detail.rewardSymbol ?? "?"}
          size={size === "lg" ? 20 : 16}
          className="text-body-sm font-medium text-pump-text"
        />
      )}
    </span>
  );
}

function ViewerRankBanner({
  viewer,
  detail,
  bnbUsd,
}: {
  viewer: LeaderboardViewer;
  detail: AirdropDetail;
  bnbUsd: number | null;
}) {
  if (viewer.rank == null || viewer.rank < 1 || viewer.rank > 100) return null;

  const rewardMeta = {
    rewardToken: detail.rewardToken,
    rewardSymbol: detail.rewardSymbol,
    rewardPriceBnb: detail.rewardPriceBnb,
    totalFunded: detail.totalFunded,
  };
  const rewardAmount = projectedRankRewardAmount(detail.totalFunded, viewer.rank);
  const rewardCompact =
    rewardAmount > 0 ? formatAirdropRewardCompact(String(rewardAmount)) : "—";
  const rewardUsd = projectedRankRewardUsd(detail.totalFunded, viewer.rank, rewardMeta, bnbUsd);

  return (
    <div className="airdrop-detail-rank-banner">
      <p className="airdrop-detail-rank-banner__copy">
        <span className="financial-value">Your rank #{viewer.rank}</span>
        <span>· est.</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="financial-value">{rewardCompact}</span>
          {!detail.rewardToken ? (
            <>
              <BnbRewardIcon size="xs" />
              <span>{NATIVE_SYMBOL}</span>
            </>
          ) : (
            <TokenSymbolInline
              address={detail.rewardToken}
              symbol={detail.rewardSymbol ?? "?"}
              size="xs"
            />
          )}
        </span>
        {rewardUsd != null ? (
          <span className="text-caption font-normal text-pump-muted">
            ({formatUsdReadable(rewardUsd, { compact: true })})
          </span>
        ) : null}
      </p>
    </div>
  );
}

function HoldCell({
  holdAmount,
  align = "right",
}: {
  holdAmount: string | null | undefined;
  align?: "left" | "right";
}) {
  const amount = Number(holdAmount);
  const hasHold = Number.isFinite(amount) && amount > 0;
  const alignClass = align === "right" ? "text-right" : "text-left";

  if (!hasHold) {
    return (
      <div className={`min-w-0 ${alignClass}`}>
        <p className="text-caption text-pump-muted">—</p>
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${alignClass}`}>
      <p className="financial-value text-caption font-medium tabular-nums text-pump-text">
        {formatAmount(holdAmount!)}
      </p>
    </div>
  );
}

const LEADERBOARD_GRID_COLS =
  "grid-cols-[1.75rem_minmax(0,1fr)_minmax(8.5rem,10rem)_minmax(8.5rem,10rem)] sm:grid-cols-[2rem_minmax(0,1fr)_minmax(9.75rem,11.25rem)_minmax(9.75rem,11.25rem)]";

const LEADERBOARD_ROW_GRID = `grid ${LEADERBOARD_GRID_COLS} items-center gap-x-4 px-3 py-2 text-caption`;

const PREVIEW_RANKS = Array.from({ length: 100 }, (_, index) => index + 1);
/** During qualify, only preview this many open slots so the board stays scannable. */
const LIVE_OPEN_SLOT_CAP = 20;

function CreatorBadge() {
  return (
    <span className="shrink-0 rounded-full bg-pump-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-pump-accent">
      Creator
    </span>
  );
}

function LeaderboardHeldHead({
  linkedToken,
  symbol,
  className = "",
}: {
  linkedToken: string;
  symbol: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <TokenSymbolInline address={linkedToken} symbol={symbol} size={10} className="shrink-0" />
      <span>held</span>
    </span>
  );
}

function LeaderboardWalletCell({
  walletAddress,
  creatorAddress,
  onWalletClick,
  compact = false,
}: {
  walletAddress: string;
  creatorAddress: string;
  onWalletClick?: (address: string) => void;
  compact?: boolean;
}) {
  const isCreator = walletAddress.toLowerCase() === creatorAddress.toLowerCase();

  return (
    <button
      type="button"
      onClick={() => onWalletClick?.(walletAddress)}
      className={`flex w-full min-w-0 rounded-md text-left transition hover:text-pump-accent active:opacity-80 ${
        compact ? "items-center gap-1.5" : "items-start gap-2"
      }`}
    >
      <UserAvatarForAddress address={walletAddress} size={compact ? 22 : 26} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span
          className={`flex flex-wrap items-center ${compact ? "gap-x-1 gap-y-0.5 text-caption" : "gap-x-1.5 gap-y-1"}`}
        >
          <span className="font-medium text-pump-text">
            <UserDisplayName address={walletAddress} compact={compact} />
          </span>
          {isCreator ? <CreatorBadge /> : null}
        </span>
      </span>
    </button>
  );
}

function LiveLeaderboardTable({
  rows,
  detail,
  bnbUsd,
  address,
  onWalletClick,
  campaignEnded = false,
  className = "",
}: {
  rows: LeaderboardRow[];
  detail: AirdropDetail;
  bnbUsd: number | null;
  address?: string;
  onWalletClick?: (walletAddress: string) => void;
  campaignEnded?: boolean;
  className?: string;
}) {
  const symbol = poolSymbol(detail);
  const rewardMeta = {
    rewardToken: detail.rewardToken,
    rewardSymbol: detail.rewardSymbol,
    rewardPriceBnb: detail.rewardPriceBnb,
    totalFunded: detail.totalFunded,
  };
  const rowByRank = new Map(rows.map((row) => [row.rank, row]));

  if (campaignEnded && rows.length === 0) {
    return <LeaderboardEmptyState ended />;
  }

  const maxRank = campaignEnded
    ? Math.max(...rows.map((row) => row.rank), 0)
    : Math.max(LIVE_OPEN_SLOT_CAP, ...rows.map((row) => row.rank), 0);
  const ranks = campaignEnded
    ? rows.map((row) => row.rank).sort((a, b) => a - b)
    : PREVIEW_RANKS.filter((rank) => rank <= maxRank);

  function rewardForRank(rank: number) {
    const amount = projectedRankRewardAmount(detail.totalFunded, rank);
    return {
      amount: amount > 0 ? formatAirdropRewardCompact(String(amount)) : "—",
      usd: projectedRankRewardUsd(detail.totalFunded, rank, rewardMeta, bnbUsd),
    };
  }

  function holdCellProps(holdAmount: string | null | undefined) {
    return {
      holdAmount,
      align: "right" as const,
    };
  }

  function rewardCellProps(reward: { amount: string; usd: number | null }) {
    return {
      amount: reward.amount,
      usd: reward.usd,
      detail,
      compact: true,
      align: "right" as const,
      usdOnly: true,
    };
  }

  if (ranks.length === 0) {
    return <LeaderboardEmptyState ended={campaignEnded} />;
  }

  return (
    <div className={className}>
      <div
        className={`sticky top-0 z-[1] hidden gap-x-3 border-b border-pump-border/10 bg-pump-card/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pump-muted backdrop-blur-sm sm:grid ${LEADERBOARD_GRID_COLS}`}
      >
        <span>#</span>
        <span>Account</span>
        <span className="flex items-center justify-end">
          <LeaderboardHeldHead linkedToken={detail.linkedToken} symbol={symbol} />
        </span>
        <span className="text-right">{campaignEnded ? "Reward" : "Est. reward"}</span>
      </div>

      <div className="airdrop-leaderboard-head sm:hidden" aria-hidden>
        <span className="airdrop-leaderboard-head__cell--rank">#</span>
        <span className="airdrop-leaderboard-head__cell--account">Account</span>
        <LeaderboardHeldHead
          linkedToken={detail.linkedToken}
          symbol={symbol}
          className="airdrop-leaderboard-head__held airdrop-leaderboard-head__cell--right"
        />
        <span className="airdrop-leaderboard-head__cell--reward">Reward</span>
      </div>

      <ul className="divide-y divide-pump-border/10">
        {ranks.map((rank) => {
          const row = rowByRank.get(rank);
          const reward = rewardForRank(rank);
          const isYou = row && address && row.address.toLowerCase() === address.toLowerCase();

          if (row) {
            return (
              <li
                key={`filled-${row.rank}-${row.address}`}
                className={isYou ? "bg-pump-accent/8" : undefined}
              >
                <div className="airdrop-leaderboard-row sm:hidden">
                  <span className="airdrop-leaderboard-row__rank">{row.rank}</span>
                  <div className="min-w-0">
                    <LeaderboardWalletCell
                      walletAddress={row.address}
                      creatorAddress={detail.creatorAddress}
                      onWalletClick={onWalletClick}
                      compact
                    />
                  </div>
                  <div className="airdrop-leaderboard-row__metric airdrop-leaderboard-row__held">
                    <HoldCell {...holdCellProps(row.holdAmount)} />
                  </div>
                  <div className="airdrop-leaderboard-row__metric airdrop-leaderboard-row__reward">
                    <RewardCell {...rewardCellProps(reward)} />
                  </div>
                </div>

                <div className={`hidden ${LEADERBOARD_ROW_GRID} sm:grid`}>
                  <span className="financial-value font-semibold tabular-nums text-pump-muted">
                    {row.rank}
                  </span>
                  <LeaderboardWalletCell
                    walletAddress={row.address}
                    creatorAddress={detail.creatorAddress}
                    onWalletClick={onWalletClick}
                  />
                  <HoldCell {...holdCellProps(row.holdAmount)} />
                  <RewardCell {...rewardCellProps(reward)} />
                </div>
              </li>
            );
          }

          if (campaignEnded) return null;

          return (
            <li key={`open-${rank}`} className="text-pump-muted/90">
              <div className="airdrop-leaderboard-row sm:hidden">
                <span className="airdrop-leaderboard-row__rank">{rank}</span>
                <span className="airdrop-leaderboard-row__open">Open</span>
                <span className="airdrop-leaderboard-row__metric airdrop-leaderboard-row__held airdrop-leaderboard-row__metric--muted">
                  —
                </span>
                <div className="airdrop-leaderboard-row__metric airdrop-leaderboard-row__reward airdrop-leaderboard-row__reward--projected">
                  <RewardCell {...rewardCellProps(reward)} />
                </div>
              </div>

              <div className={`hidden ${LEADERBOARD_ROW_GRID} sm:grid`}>
                <span className="financial-value font-semibold tabular-nums text-pump-muted">
                  {rank}
                </span>
                <span className="min-w-0 truncate text-pump-muted">Open</span>
                <HoldCell {...holdCellProps(null)} />
                <div className="airdrop-leaderboard-row__reward--projected">
                  <RewardCell {...rewardCellProps(reward)} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WinnersTable({
  rows,
  detail,
  bnbUsd,
  address,
  onWalletClick,
  className = "",
}: {
  rows: WinnerRow[];
  detail: AirdropDetail;
  bnbUsd: number | null;
  address?: string;
  onWalletClick?: (walletAddress: string) => void;
  className?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-body-sm text-pump-muted">No winners recorded yet.</p>;
  }

  const rewardMeta = {
    rewardToken: detail.rewardToken,
    rewardSymbol: detail.rewardSymbol,
    rewardPriceBnb: detail.rewardPriceBnb,
    totalFunded: detail.totalFunded,
  };

  return (
    <div className={className}>
      <div className="sticky top-0 z-[1] hidden grid-cols-[2.5rem_minmax(0,1fr)_minmax(8rem,9.5rem)] gap-x-3 border-b border-pump-border/10 bg-pump-card/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pump-muted backdrop-blur-sm sm:grid">
        <span>#</span>
        <span>Account</span>
        <span className="text-right">Reward</span>
      </div>

      <div className="airdrop-leaderboard-head airdrop-leaderboard-head--winners sm:hidden" aria-hidden>
        <span className="airdrop-leaderboard-head__cell--rank">#</span>
        <span className="airdrop-leaderboard-head__cell--account">Account</span>
        <span className="airdrop-leaderboard-head__cell--reward">Reward</span>
      </div>

      <ul className="divide-y divide-pump-border/10">
        {rows.map((row) => {
          const isYou = address && row.address.toLowerCase() === address.toLowerCase();
          const rewardCompact = formatAirdropRewardCompact(row.amount);
          const rewardUsd = airdropRewardAmountUsd(row.amount, rewardMeta, bnbUsd);

          return (
            <li key={`${row.rank}-${row.address}`} className={isYou ? "bg-pump-accent/8" : undefined}>
              <div className="airdrop-leaderboard-row airdrop-leaderboard-winners-row sm:hidden">
                <span className="airdrop-leaderboard-row__rank">{row.rank}</span>
                <div className="min-w-0">
                  <LeaderboardWalletCell
                    walletAddress={row.address}
                    creatorAddress={detail.creatorAddress}
                    onWalletClick={onWalletClick}
                    compact
                  />
                </div>
                <div className="airdrop-leaderboard-row__metric airdrop-leaderboard-row__reward">
                  <RewardCell
                    amount={rewardCompact}
                    usd={rewardUsd}
                    detail={detail}
                    compact
                    usdOnly
                  />
                </div>
              </div>

              <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_minmax(8rem,9.5rem)] items-center gap-x-3 px-3 py-2 text-caption sm:grid">
                <span className="financial-value font-semibold text-pump-muted">{row.rank}</span>
                <LeaderboardWalletCell
                  walletAddress={row.address}
                  creatorAddress={detail.creatorAddress}
                  onWalletClick={onWalletClick}
                />
                <RewardCell amount={rewardCompact} usd={rewardUsd} detail={detail} compact />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OnchainRequirementsContent({
  symbol,
  linkedToken,
  qualifyStarted,
  qualifyStart,
  qualifyEnd,
  isConnected,
  hasOnchainRules,
  progressError,
  progress,
  onConnect,
  returnTo,
}: {
  symbol: string;
  linkedToken: string;
  qualifyStarted: boolean;
  qualifyStart: string;
  qualifyEnd: string;
  isConnected: boolean;
  hasOnchainRules: boolean;
  progressError: string | null;
  progress: AirdropProgress | null;
  onConnect: () => void;
  returnTo?: string;
}) {
  const qualifyWindowLabel = `${formatQualifyWindowLocal(qualifyStart)} – ${formatQualifyWindowLocal(qualifyEnd)}`;
  return (
    <>
      {!qualifyStarted ? (
        <p className="airdrop-detail-section__body flex flex-wrap items-center gap-x-1.5 text-body-sm text-pump-muted">
          <HourglassIcon size={12} />
          <span>
            On-chain tracking opens in{" "}
            <span className="font-medium tabular-nums text-pump-text">
              {formatDurationUntil(qualifyStart)}
            </span>
            .
          </span>
        </p>
      ) : !isConnected ? (
        <div className="airdrop-detail-section__body">
          <button type="button" className="primary-button w-full sm:w-auto" onClick={onConnect}>
            Connect wallet
          </button>
        </div>
      ) : !hasOnchainRules ? (
        <p className="airdrop-detail-section__body text-body-sm text-pump-muted">
          No on-chain rules configured.
        </p>
      ) : progressError ? (
        <p className="airdrop-detail-section__body notice-error text-body-sm">{progressError}</p>
      ) : progress ? (
        <ul className="airdrop-detail-task-list">
          {progress.minHold ? (
            <RuleProgressRow
              label={`Min hold · ${symbol}`}
              rule={progress.minHold}
              unit="tokens"
              tokenAddress={linkedToken}
              buyMode="token"
              returnTo={returnTo}
              tooltipLabel="About min hold"
              tooltip="Uses your current wallet balance. Tokens from earlier campaigns on this coin still count."
            />
          ) : null}
          {progress.minBuy ? (
            <RuleProgressRow
              label="Min buy volume"
              rule={progress.minBuy}
              unit={NATIVE_SYMBOL}
              tokenAddress={linkedToken}
              buyMode="bnb"
              returnTo={returnTo}
              tooltipLabel="About min buy volume"
              tooltip={`Only buys during this campaign window count (${qualifyWindowLabel}). Each new airdrop on the same token starts buy tracking from zero.`}
            />
          ) : null}
        </ul>
      ) : (
        <p className="airdrop-detail-section__body text-body-sm text-pump-muted">
          Loading your progress…
        </p>
      )}
      {progress?.onchainQualified ? (
        <p className="airdrop-detail-onchain-qualified">
          <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
            All requirements met — rank uses your{" "}
            <TokenSymbolInline address={linkedToken} symbol={symbol} size="xs" />
            balance at qualify end.
          </span>
        </p>
      ) : null}
    </>
  );
}

export function AirdropDetailPanel({ airdropId }: { airdropId: string }) {
  const { openConnectModal } = useOpenConnectModal();
  const { address, isConnected } = useAccount();
  const { bnbUsd } = useBnbUsdPrice();
  const [detail, setDetail] = useState<AirdropDetail | null>(null);
  const [progress, setProgress] = useState<AirdropProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardViewer, setLeaderboardViewer] = useState<LeaderboardViewer | null>(null);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [claimInfo, setClaimInfo] = useState<{ amount: string; proof: string[] } | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [profileAddress, setProfileAddress] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess: claimConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const load = useCallback(async () => {
    setError(null);
    const qs = address ? `?address=${address}` : "";
    const res = await fetch(`/api/airdrops/${airdropId}${qs}`);
    const json = (await res.json()) as { data?: AirdropDetail; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to load airdrop");
    const airdrop = json.data ?? null;
    setDetail(airdrop);

    const requiredSocial = airdrop?.socialTasks.filter((t) => t.isRequired) ?? [];
    const socialDone =
      requiredSocial.length === 0 || requiredSocial.every((t) => t.completed);

    const progressPromise =
      address && airdrop && socialDone && !airdrop.merkleRoot
        ? fetch(`/api/airdrops/${airdropId}/progress?address=${address}`, {
            cache: "no-store",
          })
        : Promise.resolve(null);

    const winnersPromise = airdrop?.merkleRoot
      ? fetch(`/api/airdrops/${airdropId}/winners`)
      : Promise.resolve(null);

    const leaderboardPromise =
      airdrop && !airdrop.merkleRoot
        ? fetch(
            `/api/airdrops/${airdropId}/leaderboard${address ? `?address=${address}` : ""}`,
            { cache: "no-store" }
          )
        : Promise.resolve(null);

    const proofPromise =
      address && airdrop?.merkleRoot
        ? fetch(`/api/airdrops/${airdropId}/proof/${address}`)
        : Promise.resolve(null);

    const [progRes, winnersRes, leaderboardRes, proofRes] = await Promise.all([
      progressPromise,
      winnersPromise,
      leaderboardPromise,
      proofPromise,
    ]);

    if (progRes) {
      if (progRes.ok) {
        const progJson = (await progRes.json()) as { data?: AirdropProgress };
        setProgress(progJson.data ?? null);
        setProgressError(null);
      } else {
        const progJson = (await progRes.json()) as { error?: string };
        setProgress(null);
        setProgressError(progJson.error ?? "Could not load progress");
      }
    } else {
      setProgress(null);
      setProgressError(null);
    }

    if (winnersRes?.ok) {
      const wj = (await winnersRes.json()) as { data?: WinnerRow[] };
      setWinners(wj.data ?? []);
      setLeaderboard([]);
      setLeaderboardViewer(null);
    } else if (leaderboardRes?.ok) {
      const lbj = (await leaderboardRes.json()) as {
        data?: { rows?: LeaderboardRow[]; viewer?: LeaderboardViewer | null };
      };
      setLeaderboard(lbj.data?.rows ?? []);
      setLeaderboardViewer(lbj.data?.viewer ?? null);
      setWinners([]);
    } else {
      setWinners([]);
      setLeaderboard([]);
      setLeaderboardViewer(null);
    }

    if (proofRes?.ok) {
      const pj = (await proofRes.json()) as { data?: { amount: string; proof: string[] } };
      setClaimInfo(pj.data ?? null);
    } else {
      setClaimInfo(null);
    }
  }, [airdropId, address]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [load]);

  useEffect(() => {
    if (claimConfirmed && txHash) {
      void load();
    }
  }, [claimConfirmed, txHash, load]);

  useEffect(() => {
    if (!detail || detail.merkleRoot) return;

    const status = getAirdropDisplayStatus({
      status: detail.status,
      qualifyStart: detail.qualifyStart,
      qualifyEnd: detail.qualifyEnd,
      claimEnd: detail.claimEnd,
      merkleRoot: detail.merkleRoot,
    });

    if (status !== "QUALIFYING" && status !== "FINALIZING") return;

    const timer = window.setInterval(() => {
      void load();
    }, 12_000);

    return () => window.clearInterval(timer);
  }, [detail, load]);

  async function handleSocialTaskClick(task: AirdropSocialTask) {
    if (task.completed) return;

    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }

    if (detail && new Date(detail.qualifyStart) > new Date()) {
      setError("Qualification hasn't started — social tasks are locked.");
      return;
    }

    if (detail && new Date(detail.qualifyEnd) <= new Date()) {
      setError("Qualification period ended — social tasks are closed.");
      return;
    }

    setCompletingTaskId(task.id);
    setError(null);

    try {
      openSocialTaskParticipantUrl(task.taskType, task.targetUrl);

      const res = await fetch(`/api/airdrops/${airdropId}/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not complete task");
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete task");
    } finally {
      setCompletingTaskId(null);
    }
  }

  function onClaim() {
    if (!isConnected || !address || !detail?.onChainId || !claimInfo || !contracts.airdropManager) {
      openConnectModal?.();
      return;
    }
    writeContract({
      address: contracts.airdropManager,
      abi: pumpAirdropManagerAbi,
      functionName: "claim",
      args: [
        BigInt(detail.onChainId),
        parseEther(claimInfo.amount),
        claimInfo.proof as `0x${string}`[],
      ],
    });
  }

  if (error && !detail) {
    return (
      <div className="airdrops-page airdrop-detail-page">
        <div className="airdrop-detail-hub">
          <div className="airdrop-detail-toolbar-band">
            <div className="airdrop-detail-topbar">
              <PageBackLink href="/airdrops" className="airdrop-detail-back" />
            </div>
          </div>
          <p className="airdrop-detail-notice airdrop-detail-notice--error">{error}</p>
        </div>
      </div>
    );
  }

  if (!detail) return <AirdropDetailSkeleton />;

  const displayStatus = getAirdropDisplayStatus({
    status: detail.status,
    qualifyStart: detail.qualifyStart,
    qualifyEnd: detail.qualifyEnd,
    claimEnd: detail.claimEnd,
    merkleRoot: detail.merkleRoot,
  });

  const requiredSocialTasks = detail.socialTasks.filter((t) => t.isRequired);
  const hasSocialGate = requiredSocialTasks.length > 0;
  const socialDone = !hasSocialGate || requiredSocialTasks.every((t) => t.completed);
  const isUpcoming = displayStatus === "UPCOMING";
  const qualifyStarted = !isUpcoming;
  const qualifyEnded = new Date(detail.qualifyEnd) <= new Date();
  const onchainUnlocked = socialDone && qualifyStarted;
  const hasOnchainRules = Boolean(
    detail.rules.onchain?.minHoldWei || detail.rules.onchain?.minBuyBnbWei
  );
  const isClosed = displayStatus === "CLOSED";
  const showSocialSection =
    hasSocialGate && !socialDone && qualifyStarted && !isClosed && displayStatus !== "FINALIZING";
  const showUpcomingLockedPanel =
    isUpcoming && !detail.merkleRoot && (hasSocialGate || hasOnchainRules);
  const showOnchainSection =
    !detail.merkleRoot &&
    hasOnchainRules &&
    !isClosed &&
    displayStatus !== "FINALIZING" &&
    (hasSocialGate ? socialDone : onchainUnlocked);
  const symbol = poolSymbol(detail);
  const title = campaignTitle(detail);

  const userWinner = address
    ? winners.find((row) => row.address.toLowerCase() === address.toLowerCase())
    : undefined;
  const userAlreadyClaimed = Boolean(userWinner?.claimed);
  const userCanClaim = Boolean(claimInfo && detail.onChainId);
  const showNotQualifiedPanel =
    Boolean(detail.merkleRoot) &&
    displayStatus === "CLAIMABLE" &&
    isConnected &&
    Boolean(address) &&
    !userCanClaim &&
    !userAlreadyClaimed;
  const showClaimPanel = userCanClaim || (userAlreadyClaimed && userWinner);
  const hasLeftColumnContent =
    showSocialSection ||
    showUpcomingLockedPanel ||
    showOnchainSection ||
    showNotQualifiedPanel ||
    showClaimPanel;
  const winnersSpanFull = Boolean(detail.merkleRoot) && !hasLeftColumnContent;

  const socialStepState: "done" | "active" | "locked" | "idle" = !hasSocialGate
    ? "idle"
    : socialDone
      ? "done"
      : isUpcoming
        ? "locked"
        : "active";

  const onchainStepState: "done" | "active" | "locked" | "idle" =
    !hasOnchainRules || detail.merkleRoot
      ? "idle"
      : progress?.onchainQualified
        ? "done"
        : onchainUnlocked
          ? "active"
          : "locked";

  const claimStepState: "done" | "active" | "locked" | "idle" = userAlreadyClaimed
    ? "done"
    : userCanClaim
      ? "active"
      : "idle";

  const airdropReturnTo = `/airdrops/${airdropId}`;

  const showStepBar =
    !isClosed &&
    displayStatus !== "FINALIZING" &&
    (hasSocialGate || hasOnchainRules || showClaimPanel);
  const campaignEndedForBoard = isClosed || displayStatus === "FINALIZING";
  const rewardProps = airdropDetailRewardProps(detail, bnbUsd);
  const poolUsd = airdropRewardUsd(rewardProps, bnbUsd);
  const poolLabel =
    poolUsd != null
      ? formatUsdReadable(poolUsd, { compact: true })
      : formatAirdropReward(rewardProps.totalFunded, {
          isBnb: !rewardProps.rewardToken,
          symbol: rewardProps.rewardSymbol,
        });
  const openSocialCount = requiredSocialTasks.filter((t) => !t.completed).length;

  return (
    <div className="airdrops-page airdrop-detail-page">
      <HubDiscoveryScrollLock />
      <div className="airdrop-detail-hub">
        {error ? (
          <div className="airdrop-detail-notice airdrop-detail-notice--error">{error}</div>
        ) : null}

        <div className="airdrop-detail-toolbar-band">
          <div className="airdrop-detail-topbar">
            <PageBackLink href="/airdrops" className="airdrop-detail-back" />
            <div className="airdrop-detail-toolbar__actions">
              <AirdropSaveButton airdropId={airdropId} className="airdrop-detail-topbar__save" />
              <span className={`${airdropStatusBadgeClass(displayStatus)} airdrop-detail-status`}>
                {formatAirdropDisplayStatus(displayStatus)}
              </span>
            </div>
          </div>

          <div className="token-detail-toolbar airdrop-detail-toolbar">
            <div className="token-detail-toolbar__row airdrop-detail-toolbar__main-row">
              <div className="token-detail-toolbar__identity">
                <TokenAvatar
                  address={detail.linkedToken}
                  symbol={symbol}
                  size="lg"
                  shape="rounded"
                  className="token-detail-toolbar__logo shrink-0 !ring-0"
                />
                <div className="token-detail-toolbar__pair-meta">
                  <div className="token-detail-toolbar__symbol-row">
                    <h1 className="token-detail-toolbar__symbol truncate" title={title}>
                      {title}
                    </h1>
                    <AirdropTrustBadge compact className="airdrop-detail-toolbar__trust" />
                  </div>
                </div>
              </div>

              <div className="airdrop-detail-toolbar__stats-slot">
                <AirdropToolbarStats
                  poolLabel={poolLabel}
                  timeLabel={nowTick >= 0 ? timeLeftLabel(displayStatus, detail) : "—"}
                  participantCount={detail.participantCount}
                  showTime={displayStatus === "QUALIFYING" || displayStatus === "CLAIMABLE"}
                />
              </div>
            </div>

            {detail.description ? (
              <p className="airdrop-detail-toolbar__description" title={detail.description}>
                {detail.description}
              </p>
            ) : null}
          </div>
        </div>

        {displayStatus === "UPCOMING" && !showUpcomingLockedPanel ? (
          <AirdropDetailStatusStrip>
            <HourglassIcon size={12} className="shrink-0 text-pump-accent" aria-hidden />
            <span className="text-body-sm text-pump-muted">
              Qualification opens in{" "}
              <span className="financial-value font-semibold tabular-nums text-pump-text" aria-live="polite">
                {nowTick >= 0 ? formatDurationUntil(detail.qualifyStart) : "—"}
              </span>
            </span>
          </AirdropDetailStatusStrip>
        ) : null}

        {displayStatus === "FINALIZING" ? (
          <p className="airdrop-detail-notice airdrop-detail-notice--warning">
            Qualification ended. Winners are being ranked and the Merkle root is submitted on-chain —
            this page refreshes every 12s. When status becomes{" "}
            <span className="font-medium text-pump-accent">Claimable</span>, winners can claim.
          </p>
        ) : null}

        {showStepBar ? (
          <div className="airdrop-detail-step-bar">
            <nav className="airdrops-tab-nav" aria-label="Campaign steps">
              <div className="airdrops-tab-nav__track">
                {hasSocialGate ? (
                  <StepTab
                    label="Social"
                    state={socialStepState}
                    count={openSocialCount > 0 ? openSocialCount : undefined}
                  />
                ) : null}
                {hasOnchainRules && !detail.merkleRoot ? (
                  <StepTab label="On-chain" state={onchainStepState} />
                ) : null}
                {showClaimPanel ? <StepTab label="Claim" state={claimStepState} /> : null}
              </div>
            </nav>
          </div>
        ) : null}

        <div className="airdrop-detail-body">
          <div
            className={`airdrop-detail-body__grid${
              winnersSpanFull ? " airdrop-detail-body__grid--full-board" : ""
            }`}
          >
            {hasLeftColumnContent ? (
              <div className="airdrop-detail-body__primary">
                {showUpcomingLockedPanel ? (
                  <UpcomingTasksLockedNotice qualifyStart={detail.qualifyStart} nowTick={nowTick} />
                ) : null}

                {showSocialSection ? (
                  <section className="airdrop-detail-section">
                    <SectionHeader
                      title="Social tasks"
                      hint="Complete each task to unlock on-chain requirements."
                    />
                    <ul className="airdrop-detail-task-list">
                      {detail.socialTasks.map((task) => (
                        <SocialTaskRow
                          key={task.id}
                          task={task}
                          qualifyEnded={qualifyEnded}
                          completing={completingTaskId === task.id}
                          onComplete={() => void handleSocialTaskClick(task)}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {showOnchainSection ? (
                  <section className="airdrop-detail-section">
                    <SectionHeader title="On-chain requirements" />
                    <OnchainRequirementsContent
                        symbol={symbol}
                        linkedToken={detail.linkedToken}
                        qualifyStarted={qualifyStarted}
                        qualifyStart={detail.qualifyStart}
                        qualifyEnd={detail.qualifyEnd}
                        isConnected={isConnected}
                        hasOnchainRules={hasOnchainRules}
                        progressError={progressError}
                        progress={progress}
                        onConnect={() => openConnectModal?.()}
                        returnTo={airdropReturnTo}
                      />
                  </section>
                ) : null}

                {showNotQualifiedPanel ? (
                  <section className="airdrop-detail-section">
                    <SectionHeader
                      title="Not qualified"
                      hint="Your wallet is not in the top 100 for this round."
                    />
                    <div className="airdrop-detail-section__body">
                      <p className="text-body-sm text-pump-muted">
                        Qualification ended — winners were ranked by{" "}
                        <TokenSymbolInline
                          address={detail.linkedToken}
                          symbol={symbol}
                          size="xs"
                          className="inline-flex text-pump-text"
                        />{" "}
                        balance at qualify end. Review the final winners list.
                      </p>
                    </div>
                  </section>
                ) : null}

                {showClaimPanel && userAlreadyClaimed && userWinner ? (
                  <section className="airdrop-detail-section">
                    <SectionHeader title="Reward claimed" />
                    <div className="airdrop-detail-section__body">
                      <p className="text-body-sm text-pump-text">
                        <ClaimRewardAmount amount={userWinner.amount} detail={detail} size="sm" /> sent
                        to your wallet.
                      </p>
                    </div>
                  </section>
                ) : showClaimPanel && userCanClaim ? (
                  <section className="airdrop-detail-section airdrop-detail-section--accent">
                    <SectionHeader
                      title="You qualified"
                      hint={
                        displayStatus === "CLAIMABLE" && detail.claimEnd
                          ? `Claim before the window closes · ${nowTick >= 0 ? formatTimeRemaining(detail.claimEnd) : "—"} left`
                          : "Claim your share before the window closes."
                      }
                    />
                    <div className="airdrop-detail-section__body">
                      <ClaimRewardAmount amount={claimInfo!.amount} detail={detail} />
                      <button
                        type="button"
                        className="primary-button mt-3 flex h-10 w-full items-center justify-center gap-2 sm:w-auto sm:min-w-[9.5rem]"
                        disabled={isPending}
                        onClick={onClaim}
                      >
                        {isPending ? (
                          <span
                            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                            aria-hidden
                          />
                        ) : null}
                        {isPending ? "Claiming…" : "Claim reward"}
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

            <section
              className={`airdrop-detail-section airdrop-detail-section--board${
                winnersSpanFull || (!hasLeftColumnContent && !detail.merkleRoot)
                  ? " airdrop-detail-section--full"
                  : ""
              }`}
            >
              <SectionHeader
                title={
                  detail.merkleRoot
                    ? "Winners"
                    : campaignEndedForBoard
                      ? "Leaderboard"
                      : "Live leaderboard"
                }
                hint={
                  detail.merkleRoot
                    ? `Final top 100 ranked by ${symbol} balance at qualify end.`
                    : campaignEndedForBoard
                      ? `Final ranking by ${symbol} balance.`
                      : `Projected rewards by rank · ${symbol} balances`
                }
              />

              {!detail.merkleRoot && address && leaderboardViewer ? (
                <ViewerRankBanner
                  viewer={leaderboardViewer}
                  detail={detail}
                  bnbUsd={bnbUsd}
                />
              ) : null}

              <div className="airdrop-detail-board scrollbar-subtle max-md:overflow-visible md:overflow-y-auto md:overscroll-contain">
                {detail.merkleRoot ? (
                  <WinnersTable
                    rows={winners}
                    detail={detail}
                    bnbUsd={bnbUsd}
                    address={address}
                    onWalletClick={setProfileAddress}
                  />
                ) : (
                  <LiveLeaderboardTable
                    rows={leaderboard}
                    detail={detail}
                    bnbUsd={bnbUsd}
                    address={address}
                    onWalletClick={setProfileAddress}
                    campaignEnded={campaignEndedForBoard}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <CreatorProfileModal
        open={profileAddress != null}
        onClose={() => setProfileAddress(null)}
        creatorAddress={profileAddress ?? ""}
      />
    </div>
  );
}

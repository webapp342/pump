"use client";

import Link from "next/link";
import { HourglassIcon } from "@/components/ui/HourglassIcon";
import { PageBackLink } from "@/components/ui/PageBackLink";
import {
  AirdropParticipantsMetric,
  AirdropProgressMetric,
  AirdropRewardPoolMetric,
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
  airdropTimelineProgress,
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
import { formatUsdReadable, tokenAmountUsd } from "@/lib/format-usd";
import {
  buildTokenTradeUrl,
  remainingRuleAmount,
} from "@/lib/token-trade-prefill";
import { useAirdropSaves } from "@/components/airdrops/AirdropSavesProvider";
import { PumpIcon, faBookmarkRegular, faBookmarkSolid } from "@/lib/icons";
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
        hint="Social and on-chain steps open when qualification begins."
      />
      <div className="airdrop-detail-section__body">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-body-sm text-pump-muted">
          <HourglassIcon size={14} className="shrink-0" />
          <span>
            Opens in{" "}
            <span className="font-medium tabular-nums text-pump-text" aria-live="polite">
              {nowTick >= 0 ? formatDurationUntil(qualifyStart) : "—"}
            </span>
          </span>
        </p>
      </div>
    </section>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="airdrop-detail-section__head">
      <p className="airdrop-detail-section__title">{title}</p>
      {hint ? <p className="airdrop-detail-section__hint">{hint}</p> : null}
    </header>
  );
}

function TokenSymbolInline({
  address,
  symbol,
  size = 16,
  className = "",
}: {
  address: string;
  symbol: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <TokenAvatar address={address} symbol={symbol} size={size} className="shrink-0" />
      <span className="truncate font-medium text-pump-text">{symbol}</span>
    </span>
  );
}

function BnbRewardIcon({ size = 18 }: { size?: number }) {
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
  footnote,
}: {
  label: ReactNode;
  rule: { current: string; target: string; met: boolean };
  unit: string;
  tokenAddress: string;
  buyMode: "bnb" | "token";
  returnTo?: string;
  footnote?: string;
}) {
  const pct =
    Number(rule.target) > 0
      ? Math.min(100, (Number(rule.current) / Number(rule.target)) * 100)
      : rule.met
        ? 100
        : 0;

  const href = buildTokenTradeUrl(tokenAddress, {
    buyMode,
    amount: rule.met ? undefined : remainingRuleAmount(rule.current, rule.target),
    met: rule.met,
    returnTo,
  });

  return (
    <li>
      <Link
        href={href}
        className={`block rounded-md p-3 transition ${
          rule.met
            ? "bg-pump-accent/5 hover:bg-pump-accent/8"
            : "bg-pump-surface/35 hover:bg-pump-surface/50"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-body-sm font-medium text-pump-text">{label}</p>
          <span
            className={`status-badge shrink-0 ${rule.met ? "border-pump-accent/30 bg-pump-accent/10 text-pump-accent" : ""}`}
          >
            {rule.met ? "Met" : "In progress"}
          </span>
        </div>
        <p className="mt-1 text-caption text-pump-muted">
          {formatAmount(rule.current)} / {formatAmount(rule.target)} {unit}
        </p>
        {footnote ? <p className="mt-1 text-caption text-pump-muted/90">{footnote}</p> : null}
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-pump-surface/70">
          <div
            className={`h-full rounded-full transition-all duration-300 ${rule.met ? "bg-pump-accent" : "bg-pump-accent/70"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </Link>
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
          done ? "airdrop-detail-task-row--done" : ""
        }`}
      >
        <span className="min-w-0 truncate text-body-sm font-semibold text-pump-text">
          {socialTaskPreviewLabel(task.taskType, task.targetUrl)}
        </span>
        {done ? (
          <span className="status-badge shrink-0 text-pump-muted">Done</span>
        ) : (
          <button
            type="button"
            className="chip-button flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-caption disabled:opacity-50"
            disabled={qualifyEnded || completing}
            onClick={onComplete}
          >
            {completing ? (
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
            ) : null}
            {completing ? "Saving…" : qualifyEnded ? "Closed" : socialTaskActionLabel(task.taskType)}
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
              <BnbRewardIcon size={14} />
              <span>{NATIVE_SYMBOL}</span>
            </>
          ) : (
            <TokenSymbolInline
              address={detail.rewardToken}
              symbol={detail.rewardSymbol ?? "?"}
              size={14}
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
  linkedToken,
  poolSymbol: symbol,
  linkedPriceBnb,
  bnbUsd,
  align = "right",
  showSymbol = true,
  inlineUsd = false,
}: {
  holdAmount: string | null | undefined;
  linkedToken: string;
  poolSymbol: string;
  linkedPriceBnb: string | null;
  bnbUsd: number | null;
  align?: "left" | "right";
  showSymbol?: boolean;
  inlineUsd?: boolean;
}) {
  const amount = Number(holdAmount);
  const hasHold = Number.isFinite(amount) && amount > 0;
  const alignClass = align === "right" ? "text-right" : "text-left";
  const flexAlign = align === "right" ? "justify-end" : "justify-start";

  if (!hasHold) {
    return (
      <div className={`min-w-0 ${alignClass}`}>
        <p className="text-caption text-pump-muted">—</p>
      </div>
    );
  }

  const priceBnb = Number(linkedPriceBnb);
  const usd = tokenAmountUsd(amount, priceBnb, bnbUsd);

  return (
    <div className={`min-w-0 ${alignClass}`}>
      <div className={`flex min-w-0 items-center gap-1 ${flexAlign} flex-nowrap`}>
        <p className="financial-value shrink-0 text-caption font-medium tabular-nums text-pump-text">
          {formatAmount(holdAmount!)}
        </p>
        {showSymbol ? (
          <TokenSymbolInline
            address={linkedToken}
            symbol={symbol}
            size={12}
            className="shrink-0 text-caption font-medium text-pump-text"
          />
        ) : null}
        {inlineUsd && usd != null ? (
          <span className="financial-value shrink-0 text-caption tabular-nums text-pump-muted">
            · {formatUsdReadable(usd, { compact: true })}
          </span>
        ) : null}
      </div>
      {!inlineUsd && usd != null ? (
        <p className="text-[10px] tabular-nums text-pump-muted">
          {formatUsdReadable(usd, { compact: true })}
        </p>
      ) : null}
    </div>
  );
}

const LEADERBOARD_GRID_COLS =
  "grid-cols-[1.75rem_minmax(0,1fr)_minmax(8.5rem,10rem)_minmax(8.5rem,10rem)] sm:grid-cols-[2rem_minmax(0,1fr)_minmax(9.75rem,11.25rem)_minmax(9.75rem,11.25rem)]";

const LEADERBOARD_ROW_GRID = `grid ${LEADERBOARD_GRID_COLS} items-center gap-x-4 px-3 py-2 text-caption`;

const PREVIEW_RANKS = Array.from({ length: 100 }, (_, index) => index + 1);

function CreatorBadge() {
  return (
    <span className="shrink-0 rounded-full bg-pump-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-pump-accent">
      Creator
    </span>
  );
}

function LeaderboardWalletCell({
  walletAddress,
  viewerAddress,
  creatorAddress,
  claimed,
  onWalletClick,
  compact = false,
}: {
  walletAddress: string;
  viewerAddress?: string;
  creatorAddress: string;
  claimed?: boolean;
  onWalletClick?: (address: string) => void;
  compact?: boolean;
}) {
  const isYou =
    viewerAddress && walletAddress.toLowerCase() === viewerAddress.toLowerCase();
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
          {isYou ? <span className="text-caption text-pump-accent">(you)</span> : null}
          {claimed ? <span className="text-caption text-pump-accent">✓</span> : null}
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
  className = "",
}: {
  rows: LeaderboardRow[];
  detail: AirdropDetail;
  bnbUsd: number | null;
  address?: string;
  onWalletClick?: (walletAddress: string) => void;
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
      linkedToken: detail.linkedToken,
      poolSymbol: symbol,
      linkedPriceBnb: detail.linkedPriceBnb,
      bnbUsd,
      align: "right" as const,
      showSymbol: true,
      inlineUsd: true,
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

  return (
    <div className={className}>
      <div
        className={`sticky top-0 z-[1] hidden gap-x-3 border-b border-pump-border/10 bg-pump-card/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pump-muted backdrop-blur-sm sm:grid ${LEADERBOARD_GRID_COLS}`}
      >
        <span>#</span>
        <span>Wallet</span>
        <span className="flex items-center justify-end gap-1">
          <TokenSymbolInline address={detail.linkedToken} symbol={symbol} size={10} />
          <span>held</span>
        </span>
        <span className="text-right">Est. reward</span>
      </div>

      <div className="airdrop-leaderboard-head sm:hidden" aria-hidden>
        <span>#</span>
        <span>Wallet</span>
        <span className="airdrop-leaderboard-head__cell--right">Held</span>
        <span className="airdrop-leaderboard-head__cell--right">Est.</span>
      </div>

      <ul className="divide-y divide-pump-border/10">
        {PREVIEW_RANKS.map((rank) => {
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
                      viewerAddress={address}
                      creatorAddress={detail.creatorAddress}
                      onWalletClick={onWalletClick}
                      compact
                    />
                  </div>
                  <div className="airdrop-leaderboard-row__metric">
                    <HoldCell
                      {...holdCellProps(row.holdAmount)}
                      showSymbol={false}
                      inlineUsd={false}
                    />
                  </div>
                  <div className="airdrop-leaderboard-row__metric">
                    <RewardCell {...rewardCellProps(reward)} />
                  </div>
                </div>

                <div className={`hidden ${LEADERBOARD_ROW_GRID} sm:grid`}>
                  <span className="financial-value font-semibold tabular-nums text-pump-muted">
                    {row.rank}
                  </span>
                  <LeaderboardWalletCell
                    walletAddress={row.address}
                    viewerAddress={address}
                    creatorAddress={detail.creatorAddress}
                    onWalletClick={onWalletClick}
                  />
                  <HoldCell {...holdCellProps(row.holdAmount)} />
                  <RewardCell {...rewardCellProps(reward)} />
                </div>
              </li>
            );
          }

          return (
            <li key={`open-${rank}`} className="text-pump-muted/90">
              <div className="airdrop-leaderboard-row sm:hidden">
                <span className="airdrop-leaderboard-row__rank">{rank}</span>
                <span className="airdrop-leaderboard-row__open">Open slot</span>
                <span className="airdrop-leaderboard-row__metric airdrop-leaderboard-row__metric--muted">
                  —
                </span>
                <div className="airdrop-leaderboard-row__metric">
                  <RewardCell {...rewardCellProps(reward)} />
                </div>
              </div>

              <div className={`hidden ${LEADERBOARD_ROW_GRID} sm:grid`}>
                <span className="financial-value font-semibold tabular-nums text-pump-muted">
                  {rank}
                </span>
                <span className="min-w-0 truncate italic text-pump-muted">Open slot</span>
                <HoldCell {...holdCellProps(null)} />
                <RewardCell {...rewardCellProps(reward)} />
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
        <span>Wallet</span>
        <span className="text-right">Reward</span>
      </div>

      <div className="airdrop-leaderboard-head airdrop-leaderboard-head--winners sm:hidden" aria-hidden>
        <span>#</span>
        <span>Wallet</span>
        <span className="airdrop-leaderboard-head__cell--right">Reward</span>
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
                    viewerAddress={address}
                    creatorAddress={detail.creatorAddress}
                    claimed={row.claimed}
                    onWalletClick={onWalletClick}
                    compact
                  />
                </div>
                <div className="airdrop-leaderboard-row__metric">
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
                  viewerAddress={address}
                  creatorAddress={detail.creatorAddress}
                  claimed={row.claimed}
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
        <p className="flex flex-wrap items-center gap-x-1.5 text-body-sm text-pump-muted">
          <HourglassIcon size={14} />
          <span>
            On-chain tracking opens in{" "}
            <span className="font-medium tabular-nums text-pump-text">
              {formatDurationUntil(qualifyStart)}
            </span>
            .
          </span>
        </p>
      ) : !isConnected ? (
        <button type="button" className="primary-button w-full sm:w-auto" onClick={onConnect}>
          Connect wallet
        </button>
      ) : !hasOnchainRules ? (
        <p className="text-body-sm text-pump-muted">No on-chain rules configured.</p>
      ) : progressError ? (
        <p className="notice-error text-body-sm">{progressError}</p>
      ) : progress ? (
        <ul className="space-y-2">
          {progress.minHold ? (
            <RuleProgressRow
              label={
                <span className="inline-flex flex-wrap items-center gap-1">
                  Min hold ·{" "}
                  <TokenSymbolInline address={linkedToken} symbol={symbol} size={14} />
                </span>
              }
              rule={progress.minHold}
              unit="tokens"
              tokenAddress={linkedToken}
              buyMode="token"
              returnTo={returnTo}
              footnote="Uses your current wallet balance. Tokens from earlier campaigns on this coin still count."
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
              footnote={`Only buys during this campaign window count (${qualifyWindowLabel}). Each new airdrop on the same token starts buy tracking from zero.`}
            />
          ) : null}
        </ul>
      ) : (
        <p className="text-body-sm text-pump-muted">Loading your progress…</p>
      )}
      {progress?.onchainQualified ? (
        <p className="mt-3 rounded-md bg-pump-accent/5 px-3 py-2 text-body-sm text-pump-accent">
          <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
            All on-chain requirements met — rank is based on your{" "}
            <TokenSymbolInline address={linkedToken} symbol={symbol} size={14} />
            balance when the qualify window ends.
          </span>
        </p>
      ) : null}
    </>
  );
}

export function AirdropDetailPanel({ airdropId }: { airdropId: string }) {
  const { openConnectModal } = useOpenConnectModal();
  const { address, isConnected } = useAccount();
  const { isSaved, toggleSave } = useAirdropSaves();
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
            <PageBackLink href="/airdrops" className="airdrop-detail-back" />
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
  const showSocialSection = hasSocialGate && !socialDone && qualifyStarted;
  const showUpcomingLockedPanel =
    isUpcoming && !detail.merkleRoot && (hasSocialGate || hasOnchainRules);
  const showOnchainSection =
    !detail.merkleRoot && hasOnchainRules && (hasSocialGate ? socialDone : onchainUnlocked);
  const timelineProgress = airdropTimelineProgress(
    displayStatus,
    detail.qualifyStart,
    detail.qualifyEnd,
    detail.claimEnd
  );
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
  const saved = isSaved(airdropId);

  const rewardProps = airdropDetailRewardProps(detail, bnbUsd);
  const openSocialCount = requiredSocialTasks.filter((t) => !t.completed).length;

  return (
    <div className="airdrops-page airdrop-detail-page">
      <HubDiscoveryScrollLock />
      <div className="airdrop-detail-hub">
        {error ? (
          <div className="airdrop-detail-notice airdrop-detail-notice--error">{error}</div>
        ) : null}

        <div className="airdrop-detail-toolbar-band">
          <PageBackLink href="/airdrops" className="airdrop-detail-back" />

          <div className="token-detail-toolbar airdrop-detail-toolbar">
            <div className="token-detail-toolbar__row">
              <div className="token-detail-toolbar__identity">
                <button
                  type="button"
                  onClick={() => toggleSave(airdropId)}
                  className={
                    saved
                      ? "token-detail-toolbar__fav-btn token-detail-toolbar__fav-btn--active"
                      : "token-detail-toolbar__fav-btn"
                  }
                  aria-label={saved ? "Remove from saved" : "Save campaign"}
                >
                  <PumpIcon
                    icon={saved ? faBookmarkSolid : faBookmarkRegular}
                    className="token-detail-toolbar__fav-icon"
                  />
                </button>
                <TokenAvatar
                  address={detail.linkedToken}
                  symbol={symbol}
                  size={28}
                  className="token-detail-toolbar__logo shrink-0 !ring-0"
                />
                <div className="token-detail-toolbar__pair-meta">
                  <div className="token-detail-toolbar__symbol-row">
                    <h1 className="token-detail-toolbar__symbol truncate">{title}</h1>
                  </div>
                  <span className="token-detail-toolbar__age inline-flex min-w-0 items-center">
                    <AirdropTrustBadge />
                  </span>
                </div>
              </div>

              <div className="token-detail-toolbar__scroll">
                <div className="token-detail-toolbar__stats">
                  <div className="token-detail-toolbar__stat airdrop-detail-toolbar__stat--reward">
                    <span className="token-detail-toolbar__stat-label">
                      <span className="airdrop-detail-toolbar__stat-label-full">Reward pool</span>
                      <span className="airdrop-detail-toolbar__stat-label-short">Pool</span>
                    </span>
                    <div className="token-detail-toolbar__stat-value">
                      <AirdropRewardPoolMetric {...rewardProps} />
                    </div>
                  </div>
                  <div className="token-detail-toolbar__stat">
                    <span className="token-detail-toolbar__stat-label">Progress</span>
                    <div className="token-detail-toolbar__stat-value">
                      <AirdropProgressMetric
                        timeLabel={nowTick >= 0 ? timeLeftLabel(displayStatus, detail) : "—"}
                        progressPct={timelineProgress}
                        showBar={false}
                        showPct={false}
                      />
                    </div>
                  </div>
                  <div className="token-detail-toolbar__stat airdrop-detail-toolbar__stat--participants">
                    <div
                      className="airdrop-detail-toolbar__participants"
                      title="Participants"
                      aria-label={`Participants: ${detail.participantCount.toLocaleString()}`}
                    >
                      <PumpIcon
                        icon={MetricIcons.participants}
                        className="airdrop-detail-toolbar__participants-icon"
                        aria-hidden
                      />
                      <div className="token-detail-toolbar__stat-value">
                        <AirdropParticipantsMetric count={detail.participantCount} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="token-detail-toolbar__actions">
                <span className={`${airdropStatusBadgeClass(displayStatus)} airdrop-detail-status`}>
                  {formatAirdropDisplayStatus(displayStatus)}
                </span>
              </div>
            </div>

            {detail.description ? (
              <p className="airdrop-detail-toolbar__description">{detail.description}</p>
            ) : null}
          </div>
        </div>

        {displayStatus === "UPCOMING" ? (
          <p className="airdrop-detail-notice">
            <HourglassIcon size={14} className="shrink-0 self-center" />
            <span>
              Qualification opens in{" "}
              <span className="font-medium tabular-nums text-pump-text" aria-live="polite">
                {nowTick >= 0 ? formatDurationUntil(detail.qualifyStart) : null}
              </span>
              {hasSocialGate
                ? ". Social and on-chain tasks unlock when qualify opens."
                : hasOnchainRules
                  ? ". On-chain tracking begins when qualify opens."
                  : "."}
            </span>
          </p>
        ) : null}

        {displayStatus === "FINALIZING" ? (
          <p className="airdrop-detail-notice airdrop-detail-notice--warning">
            Qualification ended. Winners are being ranked and the Merkle root is submitted on-chain —
            this page refreshes every 12s. When status becomes{" "}
            <span className="font-medium text-pump-accent">Claimable</span>, winners can claim.
          </p>
        ) : null}

        {(hasSocialGate || hasOnchainRules || showClaimPanel) && (
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
        )}

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
                    <SectionHeader
                      title={hasSocialGate ? "On-chain requirements" : "On-chain requirements"}
                      hint="Hold or buy the pool token during the qualify window."
                    />
                    <div className="airdrop-detail-section__body">
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
                    </div>
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
                          size={14}
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
                title={detail.merkleRoot ? "Winners" : "Live leaderboard"}
                hint={
                  detail.merkleRoot
                    ? `Final top 100 ranked by ${symbol} balance at qualify end.`
                    : `Projected rewards by rank · ${symbol} balances refresh every 12s during qualify.`
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

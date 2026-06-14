"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { parseEther } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { contracts, shortAddress } from "@/config/chain";
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
  formatQualifyDate,
  formatQualifyDateTime,
  formatTimeRemaining,
  projectedRankRewardAmount,
  projectedRankRewardUsd,
  qualifyWindowProgress,
} from "@/lib/airdrop-board-format";
import {
  socialTaskActionLabel,
  socialTaskParticipantUrl,
  socialTaskPreviewLabel,
} from "@/lib/airdrop-social";
import { AirdropDetailSkeleton } from "@/components/airdrops/AirdropsSkeleton";
import { CreatorProfileModal } from "@/components/creators/CreatorProfileModal";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { BnbLogo } from "@/components/token/BnbLogo";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { formatUsdReadable, tokenAmountUsd } from "@/lib/format-usd";
import {
  buildTokenTradeUrl,
  remainingRuleAmount,
} from "@/lib/token-trade-prefill";

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

function StatCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="section-label md:text-[inherit]">{label}</dt>
      <dd className="m-0 rounded-md border border-pump-border/15 bg-pump-surface/35 px-2.5 py-2 md:px-3">
        {children}
      </dd>
    </div>
  );
}

function SectionHeader({
  title,
  hint,
  accent,
}: {
  title: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className={`section-label ${accent ? "text-pump-accent" : ""}`}>{title}</p>
      {hint ? <p className="mt-0.5 field-hint">{hint}</p> : null}
    </div>
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
      <span>${symbol}</span>
    </span>
  );
}

function BnbRewardIcon({ size = 18 }: { size?: number }) {
  return <BnbLogo size={size} />;
}

function RewardPoolStat({ detail, bnbUsd }: { detail: AirdropDetail; bnbUsd: number | null }) {
  const isBnb = !detail.rewardToken;
  const usd = airdropRewardUsd(detail, bnbUsd);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {isBnb ? (
        <BnbRewardIcon size={18} />
      ) : (
        <TokenAvatar
          address={detail.rewardToken!}
          symbol={detail.rewardSymbol ?? "?"}
          size={18}
        />
      )}
      <div className="min-w-0">
        <p className="financial-value truncate text-body-sm font-semibold text-pump-text">
          {formatAirdropReward(detail.totalFunded, {
            isBnb,
            symbol: detail.rewardSymbol,
          })}
        </p>
        {usd != null ? (
          <p className="text-caption text-pump-muted">{formatUsdReadable(usd, { compact: true })}</p>
        ) : null}
      </div>
    </div>
  );
}

function StepBadge({
  step,
  label,
  state,
}: {
  step: number;
  label: string;
  state: "done" | "active" | "locked" | "idle";
}) {
  const tone =
    state === "done"
      ? "border-pump-accent/35 bg-pump-accent/15 text-pump-accent"
      : state === "active"
        ? "border-pump-accent/45 bg-pump-accent/20 text-pump-accent"
        : state === "locked"
          ? "border-pump-border/20 bg-pump-surface/40 text-pump-muted"
          : "border-pump-border/15 bg-pump-surface/30 text-pump-muted";

  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${tone}`}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pump-bg/50 text-[10px] font-bold">
        {state === "done" ? "✓" : step}
      </span>
      <span className="text-caption font-medium">{label}</span>
    </div>
  );
}

function RuleProgressRow({
  label,
  rule,
  unit,
  tokenAddress,
  buyMode,
}: {
  label: ReactNode;
  rule: { current: string; target: string; met: boolean };
  unit: string;
  tokenAddress: string;
  buyMode: "bnb" | "token";
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
  return (
    <li
      className={`flex min-w-0 items-center justify-between gap-2 rounded-md px-2.5 py-2 transition ${
        task.completed ? "bg-pump-accent/5" : "bg-pump-surface/35"
      }`}
    >
      <span className="min-w-0 truncate text-[11px] font-medium text-pump-text md:text-caption">
        {socialTaskPreviewLabel(task.taskType, task.targetUrl)}
      </span>
      {task.completed ? (
        <span className="status-badge shrink-0 border-pump-accent/30 bg-pump-accent/10 text-[10px] text-pump-accent">
          Done
        </span>
      ) : (
        <button
          type="button"
          className="chip-button flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 py-0.5 text-[10px] disabled:opacity-50"
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
}: {
  amount: string;
  usd: number | null;
  detail: Pick<AirdropDetail, "rewardToken" | "rewardSymbol">;
  compact?: boolean;
  align?: "left" | "right";
  showSymbol?: boolean;
}) {
  const isBnb = !detail.rewardToken;
  const alignClass = align === "right" ? "text-right" : "text-left";
  const flexAlign = align === "right" ? "justify-end" : "justify-start";

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
        <span className="text-caption font-medium text-pump-text">BNB</span>
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
      <div className={`flex items-center gap-1 ${flexAlign} ${compact ? "min-w-0 flex-nowrap" : "gap-1.5"}`}>
        <p className="financial-value shrink-0 text-caption font-medium tabular-nums text-pump-text">
          {amount}
        </p>
        {tokenBadge}
      </div>
      {usd != null ? (
        <p className="text-[10px] tabular-nums text-pump-muted">
          {formatUsdReadable(usd, { compact: true })}
        </p>
      ) : null}
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
          BNB
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
    <div className="mb-3 shrink-0 rounded-md bg-pump-accent/5 px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-sm font-semibold text-pump-accent">
        <span className="financial-value">Your rank #{viewer.rank}</span>
        <span>· est.</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="financial-value">{rewardCompact}</span>
          {!detail.rewardToken ? (
            <>
              <BnbRewardIcon size={14} />
              <span>BNB</span>
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
}: {
  holdAmount: string | null | undefined;
  linkedToken: string;
  poolSymbol: string;
  linkedPriceBnb: string | null;
  bnbUsd: number | null;
  align?: "left" | "right";
  showSymbol?: boolean;
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
      <div className={`flex min-w-0 items-center gap-1 ${flexAlign}`}>
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
      </div>
      {usd != null ? (
        <p className="text-[10px] tabular-nums text-pump-muted">
          {formatUsdReadable(usd, { compact: true })}
        </p>
      ) : null}
    </div>
  );
}

const LEADERBOARD_GRID_COLS =
  "grid-cols-[1.75rem_minmax(0,1fr)_minmax(7.5rem,9rem)_minmax(7.5rem,9rem)] sm:grid-cols-[2rem_minmax(0,1fr)_minmax(8.25rem,9.5rem)_minmax(8.25rem,9.5rem)]";

const LEADERBOARD_ROW_GRID = `grid ${LEADERBOARD_GRID_COLS} items-center gap-x-3 px-3 py-2 text-caption`;

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
}: {
  walletAddress: string;
  viewerAddress?: string;
  creatorAddress: string;
  claimed?: boolean;
  onWalletClick?: (address: string) => void;
}) {
  const isYou =
    viewerAddress && walletAddress.toLowerCase() === viewerAddress.toLowerCase();
  const isCreator = walletAddress.toLowerCase() === creatorAddress.toLowerCase();

  return (
    <button
      type="button"
      onClick={() => onWalletClick?.(walletAddress)}
      className="flex w-full min-w-0 items-start gap-2 rounded-md text-left transition hover:text-pump-accent active:opacity-80"
    >
      <UserAvatarForAddress address={walletAddress} size={26} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="font-medium text-pump-text">{shortAddress(walletAddress)}</span>
          {isYou ? <span className="text-caption text-pump-accent">(you)</span> : null}
          {claimed ? <span className="text-caption text-pump-accent">✓</span> : null}
          {isCreator ? <CreatorBadge /> : null}
        </span>
      </span>
    </button>
  );
}

function LeaderboardMetricLabel({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <p
      className={`mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-pump-muted ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      {children}
    </p>
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

  function holdCellProps(holdAmount: string | null | undefined, mobile = false) {
    return {
      holdAmount,
      linkedToken: detail.linkedToken,
      poolSymbol: symbol,
      linkedPriceBnb: detail.linkedPriceBnb,
      bnbUsd,
      align: mobile ? ("left" as const) : ("right" as const),
      showSymbol: !mobile,
    };
  }

  function rewardCellProps(reward: { amount: string; usd: number | null }, mobile = false) {
    return {
      amount: reward.amount,
      usd: reward.usd,
      detail,
      compact: true,
      align: mobile ? ("left" as const) : ("right" as const),
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
                <div className="space-y-2 py-2.5 sm:hidden">
                  <div className="flex items-start gap-2.5 px-3">
                    <span className="financial-value w-5 shrink-0 pt-1 font-semibold tabular-nums text-pump-muted">
                      {row.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <LeaderboardWalletCell
                        walletAddress={row.address}
                        viewerAddress={address}
                        creatorAddress={detail.creatorAddress}
                        onWalletClick={onWalletClick}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 px-3 pl-10">
                    <div>
                      <LeaderboardMetricLabel>
                        <TokenSymbolInline address={detail.linkedToken} symbol={symbol} size={10} />
                        <span>held</span>
                      </LeaderboardMetricLabel>
                      <HoldCell {...holdCellProps(row.holdAmount, true)} />
                    </div>
                    <div>
                      <LeaderboardMetricLabel>Est. reward</LeaderboardMetricLabel>
                      <RewardCell {...rewardCellProps(reward, true)} />
                    </div>
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
              <div className="space-y-2 py-2.5 sm:hidden">
                <div className="flex items-start gap-2.5 px-3">
                  <span className="financial-value w-5 shrink-0 pt-0.5 font-semibold tabular-nums text-pump-muted">
                    {rank}
                  </span>
                  <span className="pt-1 italic text-caption text-pump-muted">Open slot</span>
                </div>
                <div className="grid grid-cols-2 gap-3 px-3 pl-10">
                  <div>
                    <LeaderboardMetricLabel>
                      <TokenSymbolInline address={detail.linkedToken} symbol={symbol} size={10} />
                      <span>held</span>
                    </LeaderboardMetricLabel>
                    <HoldCell {...holdCellProps(null, true)} />
                  </div>
                  <div>
                    <LeaderboardMetricLabel>Est. reward</LeaderboardMetricLabel>
                    <RewardCell {...rewardCellProps(reward, true)} />
                  </div>
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
      <ul className="divide-y divide-pump-border/10">
        {rows.map((row) => {
          const isYou = address && row.address.toLowerCase() === address.toLowerCase();
          const rewardCompact = formatAirdropRewardCompact(row.amount);
          const rewardUsd = airdropRewardAmountUsd(row.amount, rewardMeta, bnbUsd);

          return (
            <li key={`${row.rank}-${row.address}`} className={isYou ? "bg-pump-accent/8" : undefined}>
              <div className="space-y-2 py-2.5 sm:hidden">
                <div className="flex items-start gap-2.5 px-3">
                  <span className="financial-value w-5 shrink-0 pt-1 font-semibold tabular-nums text-pump-muted">
                    {row.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <LeaderboardWalletCell
                      walletAddress={row.address}
                      viewerAddress={address}
                      creatorAddress={detail.creatorAddress}
                      claimed={row.claimed}
                      onWalletClick={onWalletClick}
                    />
                  </div>
                </div>
                <div className="px-3 pl-10">
                  <LeaderboardMetricLabel>Reward</LeaderboardMetricLabel>
                  <RewardCell
                    amount={rewardCompact}
                    usd={rewardUsd}
                    detail={detail}
                    compact
                    align="left"
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
  isConnected,
  hasOnchainRules,
  progressError,
  progress,
  onConnect,
}: {
  symbol: string;
  linkedToken: string;
  qualifyStarted: boolean;
  qualifyStart: string;
  isConnected: boolean;
  hasOnchainRules: boolean;
  progressError: string | null;
  progress: AirdropProgress | null;
  onConnect: () => void;
}) {
  return (
    <>
      {!qualifyStarted ? (
        <p className="text-body-sm text-pump-muted">
          On-chain tracking opens {formatQualifyDateTime(qualifyStart)}.
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
            />
          ) : null}
          {progress.minBuy ? (
            <RuleProgressRow
              label="Min buy volume"
              rule={progress.minBuy}
              unit="BNB"
              tokenAddress={linkedToken}
              buyMode="bnb"
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
  const { openConnectModal } = useConnectModal();
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

    if (address && airdrop && socialDone && !airdrop.merkleRoot) {
      const progRes = await fetch(`/api/airdrops/${airdropId}/progress?address=${address}`, {
        cache: "no-store",
      });
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

    if (airdrop?.merkleRoot) {
      const w = await fetch(`/api/airdrops/${airdropId}/winners`);
      const wj = (await w.json()) as { data?: WinnerRow[] };
      setWinners(wj.data ?? []);
      setLeaderboard([]);
      setLeaderboardViewer(null);
    } else {
      const lbQs = address ? `?address=${address}` : "";
      const lb = await fetch(`/api/airdrops/${airdropId}/leaderboard${lbQs}`, {
        cache: "no-store",
      });
      if (lb.ok) {
        const lbj = (await lb.json()) as {
          data?: { rows?: LeaderboardRow[]; viewer?: LeaderboardViewer | null };
        };
        setLeaderboard(lbj.data?.rows ?? []);
        setLeaderboardViewer(lbj.data?.viewer ?? null);
      } else {
        setLeaderboard([]);
        setLeaderboardViewer(null);
      }
    }

    if (address && airdrop?.merkleRoot) {
      const p = await fetch(`/api/airdrops/${airdropId}/proof/${address}`);
      if (p.ok) {
        const pj = (await p.json()) as { data?: { amount: string; proof: string[] } };
        setClaimInfo(pj.data ?? null);
      } else {
        setClaimInfo(null);
      }
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

    if (detail && new Date(detail.qualifyEnd) <= new Date()) {
      setError("Qualification period ended — social tasks are closed.");
      return;
    }

    setCompletingTaskId(task.id);
    setError(null);

    try {
      window.open(
        socialTaskParticipantUrl(task.taskType, task.targetUrl),
        "_blank",
        "noopener,noreferrer"
      );

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
      <div className="panel-surface p-5">
        <p className="notice-error text-body-sm">{error}</p>
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
  const qualifyStarted = displayStatus !== "UPCOMING";
  const qualifyEnded = new Date(detail.qualifyEnd) <= new Date();
  const onchainUnlocked = socialDone && qualifyStarted;
  const hasOnchainRules = Boolean(
    detail.rules.onchain?.minHoldWei || detail.rules.onchain?.minBuyBnbWei
  );
  const showOnchainSection =
    !detail.merkleRoot && hasOnchainRules && (hasSocialGate ? socialDone : onchainUnlocked);
  const qualifyProgress = qualifyWindowProgress(detail.qualifyStart, detail.qualifyEnd);
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
    (hasSocialGate && !socialDone) ||
    showOnchainSection ||
    showNotQualifiedPanel ||
    showClaimPanel;
  const winnersSpanFull = Boolean(detail.merkleRoot) && !hasLeftColumnContent;

  const socialStepState: "done" | "active" | "locked" | "idle" = !hasSocialGate
    ? "idle"
    : socialDone
      ? "done"
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

  return (
    <div className="space-y-4">
      {error ? (
        <div className="notice-error rounded-lg border border-pump-danger/30 bg-pump-danger/5 px-3 py-2 text-body-sm">
          {error}
        </div>
      ) : null}

      <section className="panel-surface overflow-hidden">
        <div className="border-b border-pump-border/15 bg-gradient-to-br from-pump-accent/10 via-pump-card/80 to-pump-surface/55 p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <TokenAvatar address={detail.linkedToken} symbol={symbol} size={56} className="md:hidden" />
              <TokenAvatar
                address={detail.linkedToken}
                symbol={symbol}
                size={64}
                className="hidden md:block"
              />
              <div className="min-w-0">
                <h1 className="section-heading truncate">{title}</h1>
                {detail.description ? (
                  <p className="mt-1 text-body-sm leading-relaxed text-pump-muted">{detail.description}</p>
                ) : null}
                <p className="mt-2 text-caption text-pump-muted">
                  Pool{" "}
                  <Link
                    href={`/token/${detail.linkedToken}`}
                    className="inline-flex items-center gap-1.5 font-medium text-pump-accent hover:underline"
                  >
                    <TokenAvatar address={detail.linkedToken} symbol={symbol} size={14} />
                    ${symbol}
                  </Link>
                  {" · "}
                  Escrow on-chain
                </p>
              </div>
            </div>
            <span className={airdropStatusBadgeClass(displayStatus)}>
              {formatAirdropDisplayStatus(displayStatus)}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4 md:p-5">
          <StatCell label="Reward pool">
            <RewardPoolStat detail={detail} bnbUsd={bnbUsd} />
          </StatCell>
          <StatCell label={displayStatus === "UPCOMING" ? "Starts" : "Time left"}>
            {displayStatus === "QUALIFYING" || displayStatus === "UPCOMING" ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="financial-value text-body-sm font-semibold text-pump-text">
                    {timeLeftLabel(displayStatus, detail)}
                  </p>
                  <span className="financial-value shrink-0 text-caption text-pump-muted">
                    {Math.round(qualifyProgress)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pump-surface/60">
                  <div
                    className="h-full rounded-full bg-pump-accent transition-all duration-500"
                    style={{ width: `${qualifyProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="financial-value text-body-sm font-semibold text-pump-text">
                {timeLeftLabel(displayStatus, detail)}
              </p>
            )}
          </StatCell>
          <StatCell label="Qualify window">
            <p className="text-caption font-medium text-pump-text">
              {formatQualifyDateTime(detail.qualifyStart)}
            </p>
            <p className="text-[10px] text-pump-muted">→ {formatQualifyDateTime(detail.qualifyEnd)}</p>
          </StatCell>
          <StatCell label={detail.merkleRoot ? "Claim until" : "Distribution"}>
            <p className="text-caption font-medium text-pump-text">
              {detail.merkleRoot
                ? detail.claimEnd
                  ? formatQualifyDateTime(detail.claimEnd)
                  : "24h window"
                : "TOP 100 split"}
            </p>
            <p className="text-[10px] text-pump-muted">
              {detail.merkleRoot
                ? "Winners claim on-chain"
                : `Top 100 ranked by $${symbol} balance at qualify end`}
            </p>
          </StatCell>
        </dl>
      </section>

      {displayStatus === "UPCOMING" ? (
        <p className="rounded-lg border border-pump-border/25 bg-pump-surface/40 px-3 py-2.5 text-body-sm text-pump-muted">
          Qualification starts {formatQualifyDateTime(detail.qualifyStart)}. Complete social tasks now;
          on-chain tracking begins when qualify opens.
        </p>
      ) : null}

      {displayStatus === "FINALIZING" ? (
        <p className="rounded-lg border border-pump-warning/30 bg-pump-warning/5 px-3 py-2.5 text-body-sm text-pump-muted">
          Qualification ended. Winners are being ranked and the Merkle root is submitted on-chain — this
          page refreshes every 12s. When status becomes{" "}
          <span className="font-medium text-pump-accent">Claimable</span>, winners can claim.
        </p>
      ) : null}

      <div className="space-y-4">
        {(hasSocialGate || hasOnchainRules || showClaimPanel) && (
          <div className="flex flex-wrap gap-2">
            {hasSocialGate ? (
              <StepBadge step={1} label="Social" state={socialStepState} />
            ) : null}
            {hasOnchainRules && !detail.merkleRoot && onchainUnlocked ? (
              <StepBadge
                step={hasSocialGate ? 2 : 1}
                label="On-chain"
                state={onchainStepState}
              />
            ) : null}
            {showClaimPanel ? (
              <StepBadge
                step={hasSocialGate && hasOnchainRules ? 3 : hasSocialGate || hasOnchainRules ? 2 : 1}
                label="Claim"
                state={claimStepState}
              />
            ) : null}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[5fr_7fr] xl:items-stretch">
          <div className="flex min-h-0 flex-col gap-4">
            {hasSocialGate && !socialDone ? (
              <div className="space-y-2">
                <SectionHeader
                  title="Step 1 — Social tasks"
                  hint="Complete each task to unlock on-chain requirements."
                />
                <section className="panel-surface p-4 md:p-5">
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
              </div>
            ) : null}

            {showOnchainSection ? (
              <div className="space-y-2">
                <SectionHeader
                  title={
                    hasSocialGate ? "Step 2 — On-chain requirements" : "On-chain requirements"
                  }
                  hint="Hold or buy the pool token during the qualify window."
                />
                <section className="panel-surface p-4 md:p-5">
                  <OnchainRequirementsContent
                    symbol={symbol}
                    linkedToken={detail.linkedToken}
                    qualifyStarted={qualifyStarted}
                    qualifyStart={detail.qualifyStart}
                    isConnected={isConnected}
                    hasOnchainRules={hasOnchainRules}
                    progressError={progressError}
                    progress={progress}
                    onConnect={() => openConnectModal?.()}
                  />
                </section>
              </div>
            ) : null}

            {showNotQualifiedPanel ? (
              <div className="space-y-2">
                <SectionHeader
                  title="Not qualified"
                  hint="Your wallet is not in the top 100 for this round."
                />
                <section className="panel-surface p-4 md:p-5">
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
                </section>
              </div>
            ) : null}

            {showClaimPanel && userAlreadyClaimed && userWinner ? (
              <div className="space-y-2">
                <SectionHeader title="Reward claimed" accent />
                <section className="panel-surface p-4 md:p-5">
                  <p className="text-body-sm text-pump-text">
                    <ClaimRewardAmount amount={userWinner.amount} detail={detail} size="sm" /> sent
                    to your wallet.
                  </p>
                </section>
              </div>
            ) : showClaimPanel && userCanClaim ? (
              <div className="space-y-2">
                <SectionHeader
                  title="You qualified"
                  hint="Claim your share before the window closes."
                />
                <section className="panel-surface p-4 md:p-5">
                  <ClaimRewardAmount amount={claimInfo!.amount} detail={detail} />
                  <button
                    type="button"
                    className="primary-button mt-4 flex w-full items-center justify-center gap-2 sm:w-auto"
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
                </section>
              </div>
            ) : null}
          </div>

          <div
            className={`flex min-h-0 flex-col gap-2 ${
              winnersSpanFull || (!hasLeftColumnContent && !detail.merkleRoot)
                ? "xl:col-span-2"
                : ""
            } xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)]`}
          >
            <SectionHeader
              title={detail.merkleRoot ? "Winners" : "Live leaderboard"}
              hint={
                detail.merkleRoot
                  ? `Final top 100 ranked by $${symbol} balance at qualify end.`
                  : `Projected rewards by rank · $${symbol} balances refresh every 12s during qualify.`
              }
            />

            <section className="panel-surface flex min-h-[380px] flex-1 flex-col overflow-hidden p-3 sm:p-4 md:p-5 xl:min-h-[420px]">
              {!detail.merkleRoot && address && leaderboardViewer ? (
                <ViewerRankBanner
                  viewer={leaderboardViewer}
                  detail={detail}
                  bnbUsd={bnbUsd}
                />
              ) : null}

              <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto">
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

              {!detail.merkleRoot ? (
                <p className="mt-3 shrink-0 text-[10px] text-pump-muted">
                  {formatQualifyDate(detail.qualifyStart)} – {formatQualifyDate(detail.qualifyEnd)}
                </p>
              ) : null}
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

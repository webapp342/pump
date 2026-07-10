"use client";

import { useEffect, useState } from "react";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { AirdropTrustBadge } from "@/components/airdrops/AirdropTrustBadge";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { NATIVE_SYMBOL } from "@/config/chain";
import {
  airdropRewardUsd,
  formatAirdropReward,
  formatAirdropRewardCompact,
  projectedRankRewardAmount,
  projectedRankRewardUsd,
} from "@/lib/airdrop-board-format";
import { bnbToUsd, formatUsdReadable, tokenAmountUsd } from "@/lib/format-usd";
import { tokenPriceBnbFromMcap } from "@/lib/airdrop-usd-input";
import type { AirdropSocialTaskInput } from "@/lib/airdrop-rules";
import { socialTaskActionLabel, socialTaskPreviewLabel } from "@/lib/airdrop-social";
import type { TokenListItem } from "@/lib/db/launchpad";
import { PumpIcon } from "@/lib/icons";
import { MetricIcons } from "@/lib/metric-icons";

const PREVIEW_OPEN_RANKS = Array.from({ length: 100 }, (_, index) => index + 1);
const LEADERBOARD_GRID_COLS =
  "grid-cols-[1.75rem_minmax(0,1fr)_minmax(8.5rem,10rem)_minmax(8.5rem,10rem)] sm:grid-cols-[2rem_minmax(0,1fr)_minmax(9.75rem,11.25rem)_minmax(9.75rem,11.25rem)]";
const LEADERBOARD_ROW_GRID = `grid ${LEADERBOARD_GRID_COLS} items-center gap-x-4 px-3 py-2 text-caption`;

type PreviewTaskTab = "social" | "onchain";

type AirdropCreateDetailPreviewProps = {
  title: string;
  description: string;
  linkedToken: TokenListItem | null;
  /** Compact display label (may use K/M/B). */
  rewardAmountLabel: string;
  /** Parseable decimal for reward math (never compact). */
  rewardAmountRaw: string;
  isBnbReward: boolean;
  rewardSymbol: string;
  rewardToken: TokenListItem | null;
  minHoldTokens: string;
  minBuyBnb: string;
  socialTasks: AirdropSocialTaskInput[];
  qualifyStartIso: string;
  qualifyDurationLabel: string | null;
};

function PreviewToolbarStats({
  poolLabel,
  qualifyDurationLabel,
}: {
  poolLabel: string;
  qualifyDurationLabel: string | null;
}) {
  return (
    <div className="airdrop-toolbar-stats" aria-label="Campaign stats">
      <div className="airdrop-toolbar-stats__item" title="Reward pool">
        <PumpIcon icon={MetricIcons.rewardPool} className="airdrop-toolbar-stats__icon" aria-hidden />
        <span className="airdrop-toolbar-stats__value financial-value tabular-nums">{poolLabel}</span>
      </div>
      {qualifyDurationLabel ? (
        <div className="airdrop-toolbar-stats__item" title="Qualify window">
          <PumpIcon icon={MetricIcons.progress} className="airdrop-toolbar-stats__icon" aria-hidden />
          <span className="airdrop-toolbar-stats__value financial-value tabular-nums">
            {qualifyDurationLabel.replace(/\s*qualify window$/i, "")}
          </span>
        </div>
      ) : null}
      <div className="airdrop-toolbar-stats__item" title="Participants" aria-label="Participants: 0">
        <PumpIcon icon={MetricIcons.participants} className="airdrop-toolbar-stats__icon" aria-hidden />
        <span className="airdrop-toolbar-stats__value financial-value tabular-nums">0</span>
      </div>
    </div>
  );
}

function PreviewLeaderboard({
  symbol,
  totalFunded,
  rewardMeta,
  bnbUsd,
  isBnbReward,
}: {
  symbol: string;
  totalFunded: string;
  rewardMeta: {
    rewardToken: string | null;
    rewardSymbol: string;
    rewardPriceBnb?: string | null;
    totalFunded: string;
  };
  bnbUsd: number | null;
  isBnbReward: boolean;
}) {
  function rewardLabelForRank(rank: number) {
    const amount = projectedRankRewardAmount(totalFunded, rank);
    if (!Number.isFinite(amount) || amount <= 0) return "—";
    const usd = projectedRankRewardUsd(totalFunded, rank, rewardMeta, bnbUsd);
    if (usd != null) return formatUsdReadable(usd, { compact: true });
    const amountLabel = formatAirdropRewardCompact(String(amount));
    return isBnbReward ? amountLabel : `${amountLabel} ${rewardMeta.rewardSymbol}`;
  }

  return (
    <div className="airdrop-create-preview-board__inner">
      <div
        className={`sticky top-0 z-[1] hidden gap-x-3 border-b border-pump-border/10 bg-pump-card/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pump-muted backdrop-blur-sm sm:grid ${LEADERBOARD_GRID_COLS}`}
      >
        <span>#</span>
        <span>Account</span>
        <span className="text-right">{symbol} held</span>
        <span className="text-right">Est. reward</span>
      </div>

      <div className="airdrop-leaderboard-head sm:hidden" aria-hidden>
        <span className="airdrop-leaderboard-head__cell--rank">#</span>
        <span className="airdrop-leaderboard-head__cell--account">Account</span>
        <span className="airdrop-leaderboard-head__held airdrop-leaderboard-head__cell--right">
          {symbol} held
        </span>
        <span className="airdrop-leaderboard-head__cell--reward">Reward</span>
      </div>

      <ul className="divide-y divide-pump-border/10">
        {PREVIEW_OPEN_RANKS.map((rank) => {
          const rewardLabel = rewardLabelForRank(rank);
          return (
            <li key={`open-${rank}`} className="text-pump-muted/90">
              <div className="airdrop-leaderboard-row sm:hidden">
                <span className="airdrop-leaderboard-row__rank">{rank}</span>
                <span className="airdrop-leaderboard-row__open">Open</span>
                <span className="airdrop-leaderboard-row__metric airdrop-leaderboard-row__held airdrop-leaderboard-row__metric--muted">
                  —
                </span>
                <div className="airdrop-leaderboard-row__metric airdrop-leaderboard-row__reward airdrop-leaderboard-row__reward--projected">
                  <p className="financial-value shrink-0 text-caption font-medium tabular-nums text-pump-muted">
                    {rewardLabel}
                  </p>
                </div>
              </div>

              <div className={`hidden ${LEADERBOARD_ROW_GRID} sm:grid`}>
                <span className="financial-value font-semibold tabular-nums text-pump-muted">{rank}</span>
                <span className="min-w-0 truncate text-pump-muted">Open</span>
                <span className="text-right text-caption text-pump-muted">—</span>
                <div className="airdrop-leaderboard-row__reward--projected text-right">
                  <p className="financial-value shrink-0 text-caption font-medium tabular-nums text-pump-muted">
                    {rewardLabel}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function defaultPreviewTab(hasSocialGate: boolean, hasOnchainRules: boolean): PreviewTaskTab {
  if (hasSocialGate) return "social";
  if (hasOnchainRules) return "onchain";
  return "social";
}

export function AirdropCreateDetailPreview({
  title,
  description,
  linkedToken,
  rewardAmountLabel,
  rewardAmountRaw,
  isBnbReward,
  rewardSymbol,
  rewardToken,
  minHoldTokens,
  minBuyBnb,
  socialTasks,
  qualifyDurationLabel,
}: AirdropCreateDetailPreviewProps) {
  const { bnbUsd } = useBnbUsdPrice();
  const symbol = linkedToken?.symbol ?? "TOKEN";
  const hasSocialGate = socialTasks.length > 0;
  const hasHoldRule = minHoldTokens.trim().length > 0;
  const hasBuyRule = minBuyBnb.trim().length > 0;
  const hasOnchainRules = hasHoldRule || hasBuyRule;
  const showTaskTabs = hasSocialGate || hasOnchainRules;

  const [activeTab, setActiveTab] = useState<PreviewTaskTab>(() =>
    defaultPreviewTab(hasSocialGate, hasOnchainRules)
  );

  useEffect(() => {
    setActiveTab((current) => {
      if (current === "social" && hasSocialGate) return "social";
      if (current === "onchain" && hasOnchainRules) return "onchain";
      return defaultPreviewTab(hasSocialGate, hasOnchainRules);
    });
  }, [hasSocialGate, hasOnchainRules]);

  const rewardPriceBnb = isBnbReward
    ? null
    : tokenPriceBnbFromMcap(rewardToken?.marketCapBnb);

  const rewardMeta = {
    rewardToken: isBnbReward ? null : rewardToken?.address ?? null,
    rewardSymbol: isBnbReward ? NATIVE_SYMBOL : rewardSymbol,
    rewardPriceBnb: rewardPriceBnb != null ? String(rewardPriceBnb) : null,
    totalFunded: rewardAmountRaw.trim() || "0",
  };

  const poolUsd = airdropRewardUsd(rewardMeta, bnbUsd);
  const poolLabel =
    poolUsd != null
      ? formatUsdReadable(poolUsd, { compact: true })
      : rewardAmountLabel !== "—"
        ? `${rewardAmountLabel} ${rewardMeta.rewardSymbol}`
        : formatAirdropReward(rewardMeta.totalFunded, {
            isBnb: isBnbReward,
            symbol: rewardMeta.rewardSymbol,
          });

  const linkedPriceBnb = tokenPriceBnbFromMcap(linkedToken?.marketCapBnb);
  const holdUsd =
    hasHoldRule && linkedPriceBnb != null
      ? tokenAmountUsd(Number(minHoldTokens), linkedPriceBnb, bnbUsd)
      : null;
  const buyUsd = hasBuyRule ? bnbToUsd(Number(minBuyBnb), bnbUsd) : null;
  const holdUsdLabel = holdUsd != null ? formatUsdReadable(holdUsd, { compact: true }) : null;
  const buyUsdLabel = buyUsd != null ? formatUsdReadable(buyUsd, { compact: true }) : null;

  return (
    <div className="airdrop-create-detail-preview airdrop-detail-hub" aria-label="Campaign preview">
      <div className="airdrop-create-detail-preview__chrome">
        <div className="airdrop-detail-toolbar-band">
          <div className="token-detail-toolbar airdrop-detail-toolbar">
            <div className="token-detail-toolbar__row airdrop-detail-toolbar__main-row">
              <div className="token-detail-toolbar__identity">
                {linkedToken ? (
                  <TokenAvatar
                    address={linkedToken.address}
                    symbol={linkedToken.symbol}
                    logoUrl={linkedToken.logoUrl}
                    size={28}
                    shape="rounded"
                    className="token-detail-toolbar__logo shrink-0 !ring-0"
                  />
                ) : (
                  <div
                    className="token-detail-toolbar__logo flex shrink-0 items-center justify-center rounded-md border border-dashed border-pump-border/30 bg-pump-surface/40 text-caption text-pump-muted"
                    style={{ width: 28, height: 28 }}
                  >
                    ?
                  </div>
                )}
                <div className="token-detail-toolbar__pair-meta min-w-0">
                  <div className="token-detail-toolbar__symbol-row">
                    <h2 className="token-detail-toolbar__symbol truncate" title={title}>
                      {title}
                    </h2>
                    <AirdropTrustBadge compact className="airdrop-detail-toolbar__trust" />
                  </div>
                </div>
              </div>

              <div className="airdrop-detail-toolbar__stats-slot">
                <PreviewToolbarStats poolLabel={poolLabel} qualifyDurationLabel={qualifyDurationLabel} />
              </div>
            </div>

            {description.trim() ? (
              <p className="airdrop-detail-toolbar__description" title={description}>
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {showTaskTabs ? (
          <div className="airdrop-detail-step-bar airdrop-create-detail-preview__step-bar">
            <nav className="airdrops-tab-nav" aria-label="Campaign task preview">
              <div className="airdrops-tab-nav__track" role="tablist">
                {hasSocialGate ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "social"}
                    className={[
                      "airdrops-tab-nav__item airdrop-create-detail-preview__tab",
                      activeTab === "social" ? "airdrops-tab-nav__item--active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setActiveTab("social")}
                  >
                    Social tasks
                  </button>
                ) : null}
                {hasOnchainRules ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "onchain"}
                    className={[
                      "airdrops-tab-nav__item airdrop-create-detail-preview__tab",
                      activeTab === "onchain" ? "airdrops-tab-nav__item--active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setActiveTab("onchain")}
                  >
                    On-chain tasks
                  </button>
                ) : null}
              </div>
            </nav>
          </div>
        ) : null}
      </div>

      <div className="airdrop-detail-body airdrop-create-detail-preview__body">
        <div className="airdrop-detail-body__grid airdrop-create-detail-preview__grid">
          <div className="airdrop-detail-body__primary airdrop-create-detail-preview__primary">
            {activeTab === "social" && hasSocialGate ? (
              <section className="airdrop-detail-section airdrop-create-detail-preview__tasks">
                <ul className="airdrop-detail-task-list">
                  {socialTasks.map((task) => (
                    <li key={task.taskType}>
                      <div className="airdrop-detail-task-row">
                        <span className="min-w-0 truncate text-body-sm font-medium text-pump-text">
                          {socialTaskPreviewLabel(task.taskType, task.targetUrl)}
                        </span>
                        <span className="chip-button pointer-events-none shrink-0 whitespace-nowrap px-2.5 py-1 text-caption opacity-80">
                          {socialTaskActionLabel(task.taskType)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {activeTab === "onchain" && hasOnchainRules ? (
              <section className="airdrop-detail-section airdrop-create-detail-preview__tasks">
                <ul className="airdrop-detail-task-list">
                  {hasHoldRule ? (
                    <li>
                      <div className="airdrop-detail-task-row airdrop-detail-task-row--onchain">
                        <div className="airdrop-detail-onchain-task min-w-0">
                          <span className="airdrop-detail-onchain-task__label text-body-sm font-medium text-pump-text">
                            Min hold · {symbol}
                          </span>
                          <span className="financial-value text-caption text-pump-muted">
                            0 / {minHoldTokens} {symbol}
                            {holdUsdLabel ? ` · ${holdUsdLabel}` : ""}
                          </span>
                        </div>
                        <div className="airdrop-detail-task-row__action">
                          <span className="airdrop-detail-task-status">In progress</span>
                        </div>
                      </div>
                    </li>
                  ) : null}
                  {hasBuyRule ? (
                    <li>
                      <div className="airdrop-detail-task-row airdrop-detail-task-row--onchain">
                        <div className="airdrop-detail-onchain-task min-w-0">
                          <span className="airdrop-detail-onchain-task__label text-body-sm font-medium text-pump-text">
                            Min buy volume
                          </span>
                          <span className="financial-value text-caption text-pump-muted">
                            0 / {buyUsdLabel ?? `${minBuyBnb} ${NATIVE_SYMBOL}`}
                          </span>
                        </div>
                        <div className="airdrop-detail-task-row__action">
                          <span className="chip-button pointer-events-none shrink-0 whitespace-nowrap px-2.5 py-1 text-caption opacity-80">
                            Trade
                          </span>
                        </div>
                      </div>
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}
          </div>

          <section className="airdrop-detail-section airdrop-detail-section--board airdrop-create-detail-preview__board">
            <header className="airdrop-detail-section__head">
              <h3 className="airdrop-detail-section__title">Live leaderboard</h3>
              <p className="airdrop-detail-section__hint">
                Projected rewards by rank · {symbol} balances
              </p>
            </header>
            <div className="airdrop-detail-board airdrop-create-preview-board scrollbar-subtle">
              <PreviewLeaderboard
                symbol={symbol}
                totalFunded={rewardAmountRaw.trim() || "0"}
                rewardMeta={rewardMeta}
                bnbUsd={bnbUsd}
                isBnbReward={isBnbReward}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

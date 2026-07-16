"use client";

import Link from "next/link";
import type { MyAirdropParticipation } from "@/lib/db/airdrops";
import { formatAirdropDisplayStatus, type AirdropDisplayStatus } from "@/lib/airdrop-status";
import {
  airdropRewardAmountUsd,
  formatAirdropReward,
  formatDurationUntil,
  formatProjectedRankReward,
  formatTimeRemaining,
  projectedRankRewardUsd,
} from "@/lib/airdrop-board-format";
import {
  airdropCountdownMeta,
  formatParticipantRankLabel,
  nextActionLabel,
} from "@/lib/airdrop-participant-snapshot";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { BnbLogo } from "@/components/token/BnbLogo";
import { HourglassIcon } from "@/components/ui/HourglassIcon";

export async function fetchJoinedAirdrops(
  address: string,
  limit = 50,
  options?: { refresh?: boolean }
): Promise<MyAirdropParticipation[]> {
  const refreshQuery = options?.refresh ? "&refresh=1" : "";
  const res = await fetch(
    `/api/airdrops/mine?address=${encodeURIComponent(address)}&limit=${limit}${refreshQuery}`,
    { cache: "no-store" }
  );
  const json = (await res.json()) as { data?: MyAirdropParticipation[]; error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Failed to load joined airdrops");
  }
  return Array.isArray(json.data) ? json.data : [];
}

function poolSymbol(item: MyAirdropParticipation): string {
  return item.linkedSymbol ?? item.linkedToken.slice(0, 6);
}

function tickerLabel(item: MyAirdropParticipation): string {
  return poolSymbol(item);
}

function trimTrailingZeros(formatted: string): string {
  if (!formatted.includes(".")) return formatted;
  return formatted.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function formatEstPayoutUsd(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${trimTrailingZeros(value.toFixed(4))}`;
  return `$${trimTrailingZeros(value.toFixed(6))}`;
}

function participantRewardMeta(item: MyAirdropParticipation) {
  return {
    rewardToken: item.rewardToken,
    rewardSymbol: item.rewardSymbol,
    rewardPriceBnb: item.rewardPriceBnb,
    totalFunded: item.totalFunded,
  };
}

function participantRewardLabel(item: MyAirdropParticipation): string {
  const isBnb = !item.rewardToken;
  const opts = { isBnb, symbol: item.rewardSymbol };

  if (item.claimableAmount && Number(item.claimableAmount) > 0) {
    return formatAirdropReward(item.claimableAmount, opts);
  }

  if (item.viewerRank != null && item.viewerRank >= 1 && item.viewerRank <= 100) {
    return formatProjectedRankReward(item.totalFunded, item.viewerRank, opts);
  }

  return "—";
}

function participantRewardUsd(
  item: MyAirdropParticipation,
  bnbUsd: number | null | undefined
): string | null {
  const meta = participantRewardMeta(item);

  if (item.claimableAmount && Number(item.claimableAmount) > 0) {
    return formatEstPayoutUsd(airdropRewardAmountUsd(item.claimableAmount, meta, bnbUsd));
  }

  if (item.viewerRank != null && item.viewerRank >= 1 && item.viewerRank <= 100) {
    return formatEstPayoutUsd(
      projectedRankRewardUsd(item.totalFunded, item.viewerRank, meta, bnbUsd)
    );
  }

  return null;
}

function ParticipantRewardMetric({
  item,
  bnbUsd,
  iconSize = 18,
}: {
  item: MyAirdropParticipation;
  bnbUsd: number | null | undefined;
  iconSize?: number;
}) {
  const isBnb = !item.rewardToken;
  const label = participantRewardLabel(item);
  const usdLabel = participantRewardUsd(item, bnbUsd);

  if (label === "—") {
    return <span className="financial-value text-pump-text">—</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {isBnb ? (
        <BnbLogo size={iconSize} />
      ) : (
        <TokenAvatar
          address={item.rewardToken!}
          symbol={item.rewardSymbol ?? "?"}
          size={iconSize}
        />
      )}
      <p className="financial-value min-w-0 truncate text-pump-text">
        {label}
        {usdLabel != null ? (
          <span className="text-caption font-normal text-pump-muted"> · {usdLabel}</span>
        ) : null}
      </p>
    </div>
  );
}

function MobileRewardCell({
  item,
  bnbUsd,
}: {
  item: MyAirdropParticipation;
  bnbUsd: number | null | undefined;
}) {
  const isBnb = !item.rewardToken;
  const label = participantRewardLabel(item);
  const usdLabel = participantRewardUsd(item, bnbUsd);

  if (label === "—") {
    return <span className="text-pump-muted">—</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {isBnb ? (
        <BnbLogo size="xs" className="shrink-0" />
      ) : (
        <TokenAvatar
          address={item.rewardToken!}
          symbol={item.rewardSymbol ?? "?"}
          size="xs"
          className="shrink-0"
        />
      )}
      <span className="financial-value min-w-0 truncate text-pump-text">
        {label}
        {usdLabel != null ? (
          <span className="font-normal text-pump-muted"> · {usdLabel}</span>
        ) : null}
      </span>
    </span>
  );
}

function countdownDisplay(item: MyAirdropParticipation): {
  show: boolean;
  text: string;
  hint: string;
} {
  const meta = airdropCountdownMeta(item);
  if (!meta.time) {
    return { show: false, text: "", hint: meta.label };
  }

  const text =
    item.displayStatus === "UPCOMING"
      ? formatDurationUntil(meta.time)
      : formatTimeRemaining(meta.time);

  if (text === "Ended" || text === "Started") {
    return { show: false, text: "", hint: meta.label };
  }

  return { show: true, text, hint: meta.label };
}

function portfolioStatusTone(status: AirdropDisplayStatus): string {
  switch (status) {
    case "QUALIFYING":
      return "text-pump-accent";
    case "CLAIMABLE":
      return "text-pump-success";
    case "FINALIZING":
      return "text-pump-warning";
    default:
      return "text-pump-muted";
  }
}

function showRank(item: MyAirdropParticipation): boolean {
  return (
    item.displayStatus === "QUALIFYING" ||
    item.displayStatus === "CLAIMABLE" ||
    item.viewerRank != null
  );
}

function AirdropMobileRow({
  item,
  bnbUsd,
}: {
  item: MyAirdropParticipation;
  bnbUsd: number | null | undefined;
}) {
  const symbol = poolSymbol(item);
  const rank = formatParticipantRankLabel(item.viewerRank, {
    displayStatus: item.displayStatus,
    onchainQualified: item.onchainQualified,
  });
  const href = `/airdrops/${item.id}`;
  const countdown = countdownDisplay(item);
  const action = item.nextAction;

  return (
    <article className="portfolio-holding-mobile relative">
      <Link
        href={href}
        className="absolute inset-0 z-0"
        aria-label={`${tickerLabel(item)} airdrop`}
      />
      <div className="relative z-10 portfolio-holding-mobile__coin">
        <TokenAvatar
          address={item.linkedToken}
          symbol={symbol}
          className="portfolio-holdings-grid__coin-mark !ring-0"
        />
        <div className="min-w-0">
          <p className="portfolio-holding-mobile__title truncate">{tickerLabel(item)}</p>
          {showRank(item) ? (
            <p className="truncate text-caption text-pump-muted">
              Rank <span className="financial-value text-pump-text">{rank}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="relative z-10 portfolio-holding-mobile__amount">
        <MobileRewardCell item={item} bnbUsd={bnbUsd} />
      </div>
      <div className="relative z-10 portfolio-holding-mobile__value">
        {action === "claim" || action === "continue" ? (
          <Link
            href={href}
            className="portfolio-holding-mobile__value-main text-pump-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {nextActionLabel(action)}
          </Link>
        ) : (
          <>
            <span
              className={`portfolio-holding-mobile__value-main ${portfolioStatusTone(item.displayStatus)}`}
            >
              {formatAirdropDisplayStatus(item.displayStatus)}
            </span>
            {countdown.show ? (
              <span
                className="portfolio-holding-mobile__value-pnl inline-flex items-center justify-end gap-0.5 tabular-nums"
                title={countdown.hint}
              >
                <HourglassIcon size={10} className="shrink-0 opacity-80" />
                {countdown.text}
              </span>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function AirdropsMobileHeader() {
  return (
    <div className="portfolio-holdings-mobile__header">
      <span className="portfolio-holdings-mobile__coin-col">Coin</span>
      <span className="portfolio-holdings-mobile__amount-col">Your reward</span>
      <span className="portfolio-holdings-mobile__value-col">Status</span>
    </div>
  );
}

function TimeLeftCell({ item }: { item: MyAirdropParticipation }) {
  const countdown = countdownDisplay(item);

  if (!countdown.show) {
    return <span className="text-pump-muted">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" title={countdown.hint}>
      <HourglassIcon size={12} className="shrink-0 text-pump-muted" />
      {countdown.text}
    </span>
  );
}

function AirdropDesktopRow({
  item,
  bnbUsd,
}: {
  item: MyAirdropParticipation;
  bnbUsd: number | null | undefined;
}) {
  const symbol = poolSymbol(item);
  const rank = formatParticipantRankLabel(item.viewerRank, {
    displayStatus: item.displayStatus,
    onchainQualified: item.onchainQualified,
  });

  return (
    <tr>
      <td className="px-4 py-3">
        <Link
          href={`/airdrops/${item.id}`}
          className="portfolio-holdings-grid__coin-row flex min-w-0 items-center gap-2"
        >
          <TokenAvatar
            address={item.linkedToken}
            symbol={symbol}
            className="portfolio-holdings-grid__coin-mark !ring-0"
          />
          <p className="portfolio-holdings-grid__coin-symbol truncate">{tickerLabel(item)}</p>
        </Link>
      </td>
      <td className="portfolio-holdings-grid__num px-4 py-3 financial-value text-pump-text">
        {showRank(item) ? rank : "—"}
      </td>
      <td className="portfolio-holdings-grid__num px-4 py-3">
        <ParticipantRewardMetric item={item} bnbUsd={bnbUsd} iconSize={16} />
      </td>
      <td className="portfolio-holdings-grid__num px-4 py-3 financial-value text-pump-text">
        <TimeLeftCell item={item} />
      </td>
      <td
        className={`portfolio-holdings-grid__num px-4 py-3 text-body-sm font-medium ${portfolioStatusTone(item.displayStatus)}`}
      >
        {formatAirdropDisplayStatus(item.displayStatus)}
      </td>
      <td className="portfolio-holdings-grid__num w-[1%] whitespace-nowrap px-4 py-3 text-right">
        {item.nextAction === "claim" || item.nextAction === "continue" ? (
          <Link
            href={`/airdrops/${item.id}`}
            className={
              item.nextAction === "claim"
                ? "text-caption font-medium text-pump-accent hover:underline"
                : "text-caption font-medium text-pump-muted transition hover:text-pump-accent"
            }
          >
            {nextActionLabel(item.nextAction)}
          </Link>
        ) : (
          <span className="text-caption text-pump-muted">—</span>
        )}
      </td>
    </tr>
  );
}

export function JoinedAirdropsList({
  items,
  bnbUsd,
}: {
  items: MyAirdropParticipation[];
  bnbUsd: number | null | undefined;
}) {
  return (
    <>
      <div className="lg:hidden portfolio-holdings-mobile">
        <AirdropsMobileHeader />
        <div className="portfolio-holdings-mobile__body">
          {items.map((item) => (
            <AirdropMobileRow key={item.id} item={item} bnbUsd={bnbUsd} />
          ))}
        </div>
      </div>

      <div className="hidden lg:block overflow-x-auto">
        <table className="sheet-grid portfolio-holdings-grid portfolio-airdrops-grid min-w-[780px]">
          <thead>
            <tr>
              <th>Coin</th>
              <th className="portfolio-holdings-grid__num">Rank</th>
              <th className="portfolio-holdings-grid__num">Your reward</th>
              <th className="portfolio-holdings-grid__num">Time left</th>
              <th className="portfolio-holdings-grid__num">Status</th>
              <th className="portfolio-holdings-grid__num w-[1%] whitespace-nowrap text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <AirdropDesktopRow key={item.id} item={item} bnbUsd={bnbUsd} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

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
  type AirdropNextAction,
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
  const symbol = poolSymbol(item);
  return symbol.startsWith("$") ? symbol : `$${symbol}`;
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

function MobileRewardInline({
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
      <span className="shrink-0 text-pump-muted">Your reward</span>
      {isBnb ? (
        <BnbLogo size={14} className="shrink-0" />
      ) : (
        <TokenAvatar
          address={item.rewardToken!}
          symbol={item.rewardSymbol ?? "?"}
          size={14}
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

function mobileActionButtonClass(action: AirdropNextAction): string {
  const base = "relative z-10 shrink-0 rounded-md px-2.5 py-1 text-caption font-semibold";
  if (action === "claim") {
    return `${base} primary-button h-7 min-h-0`;
  }
  return `${base} border border-pump-accent/35 bg-pump-accent/10 text-pump-accent`;
}

function MobileAirdropTrailing({ item, href }: { item: MyAirdropParticipation; href: string }) {
  const action = item.nextAction;

  if (action === "claim" || action === "continue") {
    return (
      <Link
        href={href}
        className={mobileActionButtonClass(action)}
        onClick={(e) => e.stopPropagation()}
      >
        {nextActionLabel(action)}
      </Link>
    );
  }

  return (
    <span
      className={`relative z-10 shrink-0 self-center text-caption font-medium ${portfolioStatusTone(item.displayStatus)}`}
    >
      {formatAirdropDisplayStatus(item.displayStatus)}
    </span>
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

  return (
    <article className="relative grid grid-cols-[var(--token-logo-size-inline)_1fr_auto] gap-x-2 gap-y-1.5 p-2.5 transition active:bg-pump-border/8">
      <Link href={href} className="absolute inset-0 z-0 rounded-[inherit]" aria-label={`${tickerLabel(item)} airdrop`} />
      <TokenAvatar
        address={item.linkedToken}
        symbol={symbol}
        className="relative z-10 row-span-2 self-center portfolio-holdings-grid__coin-mark !ring-0"
      />
      <div className="relative z-10 flex min-w-0 items-center gap-1.5 overflow-hidden">
        <p className="truncate text-body-sm font-medium text-pump-text">{tickerLabel(item)}</p>
        {countdown.show ? (
          <span
            className="financial-value inline-flex shrink-0 items-center gap-0.5 tabular-nums text-caption text-pump-muted"
            title={countdown.hint}
          >
            <HourglassIcon size={11} className="opacity-80" />
            {countdown.text}
          </span>
        ) : null}
      </div>
      <MobileAirdropTrailing item={item} href={href} />
      <div className="relative z-10 col-span-2 col-start-2 flex min-w-0 items-center gap-2 overflow-hidden text-[11px] leading-tight">
        {showRank(item) ? (
          <span className="financial-value shrink-0 text-pump-text">
            <span className="text-pump-muted">Rank </span>
            {rank}
          </span>
        ) : null}
        <MobileRewardInline item={item} bnbUsd={bnbUsd} />
      </div>
    </article>
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
    <section className="rounded-lg border border-pump-border/15 bg-transparent">
      <div className="divide-y divide-pump-border/10 lg:hidden">
        {items.map((item) => (
          <AirdropMobileRow key={item.id} item={item} bnbUsd={bnbUsd} />
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="sheet-grid min-w-[780px]">
          <thead>
            <tr>
              <th>Coin</th>
              <th>Rank</th>
              <th>Your reward</th>
              <th>Time left</th>
              <th>Status</th>
              <th className="w-[1%] whitespace-nowrap text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const symbol = poolSymbol(item);
              const rank = formatParticipantRankLabel(item.viewerRank, {
                displayStatus: item.displayStatus,
                onchainQualified: item.onchainQualified,
              });

              return (
                <tr key={item.id} className="group">
                  <td>
                    <Link
                      href={`/airdrops/${item.id}`}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <TokenAvatar
                        address={item.linkedToken}
                        symbol={symbol}
                        className="portfolio-holdings-grid__coin-mark !ring-0"
                      />
                      <p className="truncate text-body-sm font-medium text-pump-text">
                        {tickerLabel(item)}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 financial-value tabular-nums text-pump-text">
                    {showRank(item) ? rank : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ParticipantRewardMetric item={item} bnbUsd={bnbUsd} />
                  </td>
                  <td className="px-4 py-3 financial-value text-pump-text">
                    <TimeLeftCell item={item} />
                  </td>
                  <td
                    className={`px-4 py-3 text-body-sm font-medium ${portfolioStatusTone(item.displayStatus)}`}
                  >
                    {formatAirdropDisplayStatus(item.displayStatus)}
                  </td>
                  <td className="w-[1%] whitespace-nowrap px-4 py-3 text-right">
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
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

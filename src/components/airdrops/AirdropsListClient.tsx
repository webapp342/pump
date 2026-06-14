"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shortAddress } from "@/config/chain";
import type { AirdropListItem } from "@/lib/db/airdrops";
import {
  airdropStatusBadgeClass,
  formatAirdropDisplayStatus,
  getAirdropDisplayStatus,
  type AirdropDisplayStatus,
} from "@/lib/airdrop-status";
import {
  airdropRewardUsd,
  formatAirdropReward,
  formatDurationUntil,
  formatQualifyDate,
  formatQualifyDateTime,
  formatTimeRemaining,
  isEndingSoon,
  qualifyWindowProgress,
} from "@/lib/airdrop-board-format";
import { AirdropsSkeleton } from "@/components/airdrops/AirdropsSkeleton";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { BnbLogo } from "@/components/token/BnbLogo";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { formatUsdReadable } from "@/lib/format-usd";

type AirdropFilter =
  | "all"
  | "qualifying"
  | "claimable"
  | "upcoming"
  | "endingSoon"
  | "ended"
  | "highValue";
type SortKey = "reward" | "end" | "start" | "status";
type SortDir = "asc" | "desc";

type EnrichedAirdrop = AirdropListItem & {
  displayStatus: AirdropDisplayStatus;
  rewardNum: number;
  rewardUsd: number;
};

const HIGH_VALUE_THRESHOLD = 10_000;
const ENDING_SOON_HOURS = 48;

function rewardUsdValue(
  item: Pick<AirdropListItem, "totalFunded" | "rewardToken" | "rewardPriceBnb">,
  bnbUsd: number | null | undefined
): number {
  const usd = airdropRewardUsd(item, bnbUsd);
  if (usd != null) return usd;
  return Number(item.totalFunded) || 0;
}

const createCampaignButtonClass =
  "toolbar-btn toolbar-btn-accent shrink-0";

function CreateCampaignLink({
  variant,
  className = "",
}: {
  variant: "mobile" | "desktop" | "empty";
  className?: string;
}) {
  const label = variant === "mobile" ? "+ Create" : "+ Create campaign";

  return (
    <Link
      href="/airdrops/create"
      prefetch={true}
      className={`${createCampaignButtonClass} ${className}`}
    >
      <span>{label}</span>
    </Link>
  );
}

function enrichItem(item: AirdropListItem, bnbUsd: number | null): EnrichedAirdrop {
  return {
    ...item,
    displayStatus: getAirdropDisplayStatus({
      status: item.status,
      qualifyStart: item.qualifyStart,
      qualifyEnd: item.qualifyEnd,
      claimEnd: item.claimEnd,
      merkleRoot: item.status === "FINALIZED" ? "0x1" : null,
    }),
    rewardNum: Number(item.totalFunded) || 0,
    rewardUsd: rewardUsdValue(item, bnbUsd),
  };
}

function campaignTitle(item: AirdropListItem): string {
  return item.title ?? item.linkedName ?? item.linkedSymbol ?? shortAddress(item.linkedToken);
}

function poolSymbol(item: AirdropListItem): string {
  return item.linkedSymbol ?? shortAddress(item.linkedToken);
}

function BnbRewardIcon({ size = 18 }: { size?: number }) {
  return <BnbLogo size={size} />;
}

function RewardPoolDisplay({
  item,
  bnbUsd,
  avatarSize = 18,
  showUsd = false,
  amountClassName = "financial-value truncate text-caption font-semibold text-pump-text",
}: {
  item: AirdropListItem;
  bnbUsd: number | null;
  avatarSize?: number;
  showUsd?: boolean;
  amountClassName?: string;
}) {
  const isBnb = !item.rewardToken;
  const usd = airdropRewardUsd(item, bnbUsd);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {isBnb ? (
        <BnbRewardIcon size={avatarSize} />
      ) : (
        <TokenAvatar
          address={item.rewardToken!}
          symbol={item.rewardSymbol ?? "?"}
          size={avatarSize}
        />
      )}
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className={amountClassName}>
          {formatAirdropReward(item.totalFunded, {
            isBnb,
            symbol: item.rewardSymbol,
          })}
        </span>
        {showUsd && usd != null ? (
          <span className="shrink-0 text-caption text-pump-muted">
            {formatUsdReadable(usd, { compact: true })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function matchesFilter(item: EnrichedAirdrop, filter: AirdropFilter): boolean {
  if (filter === "qualifying") return item.displayStatus === "QUALIFYING";
  if (filter === "claimable") return item.displayStatus === "CLAIMABLE";
  if (filter === "upcoming") return item.displayStatus === "UPCOMING";
  if (filter === "endingSoon") {
    return item.displayStatus === "QUALIFYING" && isEndingSoon(item.qualifyEnd, ENDING_SOON_HOURS);
  }
  if (filter === "ended") return item.displayStatus === "CLOSED";
  if (filter === "highValue") return item.rewardUsd >= HIGH_VALUE_THRESHOLD;
  return true;
}

function statusSortWeight(status: AirdropDisplayStatus): number {
  switch (status) {
    case "QUALIFYING":
      return 4;
    case "CLAIMABLE":
      return 3;
    case "UPCOMING":
      return 2;
    case "FINALIZING":
      return 1;
    default:
      return 0;
  }
}

function timelineLabel(item: EnrichedAirdrop): string {
  switch (item.displayStatus) {
    case "UPCOMING":
      return `Starts ${formatQualifyDateTime(item.qualifyStart)}`;
    case "QUALIFYING":
      return `Ends ${formatQualifyDateTime(item.qualifyEnd)}`;
    case "FINALIZING":
      return "Allocating winners";
    case "CLAIMABLE":
      return item.claimEnd
        ? `Claim by ${formatQualifyDateTime(item.claimEnd)}`
        : "Claims open";
    default:
      return "Campaign closed";
  }
}

function timeLeftLabel(item: EnrichedAirdrop): string {
  switch (item.displayStatus) {
    case "UPCOMING":
      return formatDurationUntil(item.qualifyStart);
    case "QUALIFYING":
      return formatTimeRemaining(item.qualifyEnd);
    case "CLAIMABLE":
      return item.claimEnd ? formatTimeRemaining(item.claimEnd) : "Open";
    default:
      return "—";
  }
}

function featuredBadge(status: AirdropDisplayStatus): string {
  switch (status) {
    case "QUALIFYING":
      return "Live campaign";
    case "CLAIMABLE":
      return "Claims open";
    case "UPCOMING":
      return "Starting soon";
    default:
      return "Featured";
  }
}

function HighlightAirdropCard({
  href,
  label,
  item,
}: {
  href: string;
  label: string;
  item: EnrichedAirdrop;
}) {
  const symbol = poolSymbol(item);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="section-label md:hidden">{label}</p>
      <Link
        href={href}
        className="panel-interactive flex min-w-0 flex-nowrap items-center gap-2 px-2.5 py-2.5 md:justify-between md:gap-3 md:px-3 md:py-3"
      >
        <p className="section-label hidden shrink-0 md:inline">{label}</p>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <TokenAvatar address={item.linkedToken} symbol={symbol} size={18} />
          <p className="truncate text-caption font-medium text-pump-text">${symbol}</p>
        </div>
      </Link>
    </div>
  );
}

function pickFeatured(items: EnrichedAirdrop[]): EnrichedAirdrop | null {
  if (!items.length) return null;

  const byPriority = (list: EnrichedAirdrop[]) =>
    [...list].sort((a, b) => b.rewardUsd - a.rewardUsd)[0] ?? null;

  const qualifying = items.filter((i) => i.displayStatus === "QUALIFYING");
  if (qualifying.length) return byPriority(qualifying);

  const claimable = items.filter((i) => i.displayStatus === "CLAIMABLE");
  if (claimable.length) return byPriority(claimable);

  const upcoming = items.filter((i) => i.displayStatus === "UPCOMING");
  if (upcoming.length) return byPriority(upcoming);

  return byPriority(items);
}

export function AirdropsListClient() {
  const [items, setItems] = useState<AirdropListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<AirdropFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("reward");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { bnbUsd } = useBnbUsdPrice();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/airdrops", { cache: "no-store" });
      const json = (await res.json()) as { data?: AirdropListItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load airdrops");
      setItems(json.data ?? []);
      setError(null);
    } catch (err) {
      setItems(null);
      setError(err instanceof Error ? err.message : "Failed to load airdrops");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const resolvedItems = useMemo(
    () => (items ?? []).map((item) => enrichItem(item, bnbUsd)),
    [items, bnbUsd]
  );
  const featured = useMemo(() => pickFeatured(resolvedItems), [resolvedItems]);

  const stats = useMemo(() => {
    let totalUsd = 0;
    let pricedCount = 0;
    for (const item of resolvedItems) {
      const usd = airdropRewardUsd(item, bnbUsd);
      if (usd != null) {
        totalUsd += usd;
        pricedCount += 1;
      }
    }
    return {
      totalUsd: pricedCount > 0 ? totalUsd : null,
    };
  }, [resolvedItems, bnbUsd]);

  const largestReward = useMemo(
    () => [...resolvedItems].sort((a, b) => b.rewardUsd - a.rewardUsd)[0] ?? null,
    [resolvedItems]
  );

  const endingSoonest = useMemo(() => {
    const qualifying = resolvedItems.filter((i) => i.displayStatus === "QUALIFYING");
    if (!qualifying.length) return null;
    return [...qualifying].sort(
      (a, b) => new Date(a.qualifyEnd).getTime() - new Date(b.qualifyEnd).getTime()
    )[0];
  }, [resolvedItems]);

  const filterCounts = useMemo(() => {
    return {
      all: resolvedItems.length,
      qualifying: resolvedItems.filter((i) => matchesFilter(i, "qualifying")).length,
      claimable: resolvedItems.filter((i) => matchesFilter(i, "claimable")).length,
      upcoming: resolvedItems.filter((i) => matchesFilter(i, "upcoming")).length,
      endingSoon: resolvedItems.filter((i) => matchesFilter(i, "endingSoon")).length,
      ended: resolvedItems.filter((i) => matchesFilter(i, "ended")).length,
      highValue: resolvedItems.filter((i) => matchesFilter(i, "highValue")).length,
    };
  }, [resolvedItems]);

  const boardItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = resolvedItems.filter((item) => {
      if (term) {
        const haystack = [
          campaignTitle(item),
          poolSymbol(item),
          item.linkedName,
          item.linkedSymbol,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return matchesFilter(item, activeFilter);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (activeFilter === "all") {
        const aClosed = a.displayStatus === "CLOSED";
        const bClosed = b.displayStatus === "CLOSED";
        if (aClosed !== bClosed) return aClosed ? 1 : -1;
      }

      let delta = 0;
      if (sortKey === "reward") delta = a.rewardUsd - b.rewardUsd;
      else if (sortKey === "end") {
        delta = new Date(a.qualifyEnd).getTime() - new Date(b.qualifyEnd).getTime();
      } else if (sortKey === "start") {
        delta = new Date(a.qualifyStart).getTime() - new Date(b.qualifyStart).getTime();
      } else {
        delta = statusSortWeight(a.displayStatus) - statusSortWeight(b.displayStatus);
      }
      return sortDir === "asc" ? delta : -delta;
    });

    return sorted;
  }, [resolvedItems, search, activeFilter, sortKey, sortDir]);

  function onSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "reward" ? "desc" : "asc");
  }

  const sortLabel = (key: SortKey) =>
    sortKey === key ? `${sortDir === "asc" ? "↑" : "↓"}` : "";
  const sortHeadClass = (key: SortKey) =>
    `inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition ${
      sortKey === key ? "text-pump-accent" : "text-pump-muted hover:text-pump-text"
    }`;

  if (items === null && !error) {
    return <AirdropsSkeleton />;
  }

  if (error) {
    return <div className="notice-error p-4">{error}</div>;
  }

  if (resolvedItems.length === 0) {
    return (
      <div className="panel-surface p-8 text-center">
        <p className="text-body-sm text-pump-muted">No active airdrop campaigns yet.</p>
        <p className="mt-2 text-caption text-pump-muted">
          Launch holder and buyer rewards with on-chain escrow and Merkle claims.
        </p>
        <CreateCampaignLink variant="empty" className="mt-4 h-10 px-5 text-body-sm" />
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {featured ? (
        <section className="space-y-2 md:space-y-3">
          <Link
            href={`/airdrops/${featured.id}`}
            className="panel-interactive block p-3 md:p-4"
          >
            <div className="flex items-start justify-between gap-2 md:gap-4">
              <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
                <TokenAvatar
                  address={featured.linkedToken}
                  symbol={poolSymbol(featured)}
                  size={38}
                  className="md:hidden"
                />
                <TokenAvatar
                  address={featured.linkedToken}
                  symbol={poolSymbol(featured)}
                  size={46}
                  className="hidden md:block"
                />
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-pump-text md:card-title">
                    {campaignTitle(featured)}
                  </p>
                  <p className="text-caption text-pump-muted">
                    <span className="md:hidden">${poolSymbol(featured)}</span>
                    <span className="hidden md:inline">
                      Pool ${poolSymbol(featured)} · Escrow on-chain
                    </span>
                  </p>
                </div>
              </div>
              <span className="status-badge shrink-0 text-[10px] md:text-[inherit]">
                {featuredBadge(featured.displayStatus)}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-2 md:mt-4 md:grid-cols-4 md:gap-2">
              <div className="flex min-w-0 flex-col gap-1 md:col-span-1">
                <dt className="section-label md:text-[inherit]">Reward pool</dt>
                <dd className="sheet-cell m-0 md:px-3">
                  <RewardPoolDisplay
                    item={featured}
                    bnbUsd={bnbUsd}
                    avatarSize={18}
                    showUsd
                    amountClassName="financial-value truncate text-body-sm font-semibold text-pump-text"
                  />
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="section-label md:text-[inherit]">Progress</dt>
                <dd className="sheet-cell m-0 md:px-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="financial-value text-caption font-semibold text-pump-text">
                      {timeLeftLabel(featured)}
                    </span>
                    <span className="financial-value shrink-0 text-caption text-pump-muted">
                      {Math.round(
                        qualifyWindowProgress(featured.qualifyStart, featured.qualifyEnd)
                      )}
                      %
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden border border-pump-border/45 bg-pump-border/8">
                    <div
                      className="h-full bg-pump-accent transition-all duration-500"
                      style={{
                        width: `${qualifyWindowProgress(featured.qualifyStart, featured.qualifyEnd)}%`,
                      }}
                    />
                  </div>
                </dd>
              </div>
              <div className="hidden min-w-0 flex-col gap-1 md:flex">
                <dt className="section-label">Pool token</dt>
                <dd className="sheet-cell m-0">
                  <span className="financial-value text-body-sm font-semibold text-pump-text">
                    ${poolSymbol(featured)}
                  </span>
                </dd>
              </div>
              <div className="hidden min-w-0 flex-col gap-1 md:flex">
                <dt className="section-label">Status</dt>
                <dd className="sheet-cell m-0">
                  <span
                    className={`text-body-sm font-semibold ${airdropStatusBadgeClass(featured.displayStatus)}`}
                  >
                    {formatAirdropDisplayStatus(featured.displayStatus)}
                  </span>
                </dd>
              </div>
            </dl>

            <p className="mt-2 hidden text-caption text-pump-muted md:block">
              {featured.displayStatus === "UPCOMING" ||
              featured.displayStatus === "QUALIFYING" ? (
                <>
                  {formatQualifyDate(featured.qualifyStart)} – {formatQualifyDate(featured.qualifyEnd)}
                </>
              ) : (
                timelineLabel(featured)
              )}
            </p>
          </Link>

          {resolvedItems.length > 1 ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible">
              <span className="section-label shrink-0 text-[10px] md:text-[inherit]">More</span>
              {resolvedItems
                .filter((item) => item.id !== featured.id)
                .slice(0, 4)
                .map((item) => (
                  <Link
                    key={item.id}
                    href={`/airdrops/${item.id}`}
                    className="inline-flex shrink-0 items-center gap-1.5 border border-pump-border/45 bg-pump-border/4 px-2 py-0.5 text-caption text-pump-muted hover:text-pump-text md:gap-2 md:px-2.5 md:py-1"
                  >
                    <TokenAvatar address={item.linkedToken} symbol={poolSymbol(item)} size={16} className="md:hidden" />
                    <TokenAvatar address={item.linkedToken} symbol={poolSymbol(item)} size={18} className="hidden md:block" />
                    <span className="text-caption text-pump-text">{campaignTitle(item)}</span>
                  </Link>
                ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
        <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
          <p className="section-label md:hidden">Total pool</p>
          <div className="panel-surface flex flex-nowrap items-center justify-between gap-2 px-2.5 py-2.5 md:gap-3 md:px-3 md:py-3">
            <p className="section-label hidden shrink-0 md:inline">Total pool</p>
            <p className="financial-value shrink-0 text-body-sm font-semibold text-pump-text">
              {stats.totalUsd != null ? formatUsdReadable(stats.totalUsd, { compact: true }) : "—"}
            </p>
            <p className="min-w-0 truncate text-right text-caption text-pump-muted">
              {resolvedItems.length} campaigns · USD est.
            </p>
          </div>
        </div>

        {largestReward ? (
          <HighlightAirdropCard
            href={`/airdrops/${largestReward.id}`}
            label="Largest pool"
            item={largestReward}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <p className="section-label md:hidden">Largest pool</p>
            <div className="panel-surface flex flex-nowrap items-center gap-2 px-2.5 py-2.5 md:justify-between md:gap-3 md:px-3 md:py-3">
              <p className="section-label hidden shrink-0 md:inline">Largest pool</p>
              <p className="shrink-0 text-body-sm text-pump-muted">—</p>
            </div>
          </div>
        )}

        {endingSoonest ? (
          <HighlightAirdropCard
            href={`/airdrops/${endingSoonest.id}`}
            label="Ending soon"
            item={endingSoonest}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <p className="section-label md:hidden">Ending soon</p>
            <div className="panel-surface flex flex-nowrap items-center gap-2 px-2.5 py-2.5 md:justify-between md:gap-3 md:px-3 md:py-3">
              <p className="section-label hidden shrink-0 md:inline">Ending soon</p>
              <p className="shrink-0 text-body-sm text-pump-muted">—</p>
            </div>
          </div>
        )}
      </section>

      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-heading">Explore campaigns</h2>
          <CreateCampaignLink variant="mobile" className="h-8 px-2.5 text-caption md:hidden" />
          <CreateCampaignLink variant="desktop" className="hidden h-9 whitespace-nowrap px-4 text-body-sm md:inline-flex" />
        </div>

        <div className="flex flex-col gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaign or token"
            className="field-input h-9 w-full bg-pump-surface/75 md:max-w-xs"
          />
          <div className="sheet-tabs -mx-2 overflow-x-auto px-2 md:mx-0 md:px-0">
            {(
              [
                ["all", "All", "All"],
                ["qualifying", "Live", "Qualifying"],
                ["claimable", "Claim", "Claimable"],
                ["upcoming", "Soon", "Upcoming"],
                ["endingSoon", "Ending", "Ending soon"],
                ["ended", "Ended", "Ended"],
                ["highValue", "High", "High value"],
              ] as const
            ).map(([key, mobileLabel, desktopLabel]) => {
              const count = filterCounts[key] ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveFilter(key)}
                  className={`shrink-0 max-md:px-2.5 max-md:py-1.5 ${
                    activeFilter === key ? "chip-button chip-button-active" : "chip-button"
                  }`}
                >
                  <span className="md:hidden">
                    {mobileLabel} ({count})
                  </span>
                  <span className="hidden md:inline">
                    {desktopLabel} ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="panel-surface overflow-hidden">
          {boardItems.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-pump-muted">
              No campaigns match your filters.
            </div>
          ) : (
            <>
              <div className="divide-y divide-pump-border/10 lg:hidden">
                {boardItems.map((item) => (
                  <article
                    key={item.id}
                    className="grid grid-cols-[1.75rem_1fr_auto] gap-x-2 gap-y-2 p-2.5"
                  >
                    <TokenAvatar
                      address={item.linkedToken}
                      symbol={poolSymbol(item)}
                      size={28}
                      className="row-span-2 self-start"
                    />
                    <Link
                      href={`/airdrops/${item.id}`}
                      className="flex min-w-0 items-baseline gap-2 self-center"
                    >
                      <p className="truncate text-body-sm font-medium text-pump-text">
                        {campaignTitle(item)}
                      </p>
                      <p className="shrink-0 text-caption text-pump-muted">${poolSymbol(item)}</p>
                    </Link>
                    <span
                      className={`shrink-0 self-center text-[10px] ${airdropStatusBadgeClass(item.displayStatus)}`}
                    >
                      {formatAirdropDisplayStatus(item.displayStatus)}
                    </span>
                    <div className="col-span-2 col-start-2 flex flex-col gap-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="section-label shrink-0 text-[10px]">Reward</p>
                        <RewardPoolDisplay
                          item={item}
                          bnbUsd={bnbUsd}
                          avatarSize={14}
                          showUsd
                          amountClassName="financial-value truncate text-[11px] font-semibold text-pump-text"
                        />
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="section-label shrink-0 text-[10px]">Left</p>
                        <p className="financial-value text-[11px] font-semibold text-pump-text">
                          {timeLeftLabel(item)}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden lg:block overflow-x-auto">
                <table className="sheet-grid min-w-[960px]">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Pool</th>
                      <th>
                        <button type="button" onClick={() => onSort("reward")} className={sortHeadClass("reward")}>
                          Reward pool {sortLabel("reward")}
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => onSort("status")} className={sortHeadClass("status")}>
                          Status {sortLabel("status")}
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => onSort("end")} className={sortHeadClass("end")}>
                          Deadline {sortLabel("end")}
                        </button>
                      </th>
                      <th>Time left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boardItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <Link
                              href={`/airdrops/${item.id}`}
                              className="flex min-w-0 items-center gap-3"
                            >
                              <TokenAvatar
                                address={item.linkedToken}
                                symbol={poolSymbol(item)}
                                size={30}
                              />
                              <div className="flex min-w-0 items-baseline gap-2">
                                <p className="truncate font-medium text-pump-text">
                                  {campaignTitle(item)}
                                </p>
                                <p className="shrink-0 text-caption text-pump-muted">
                                  ${poolSymbol(item)}
                                </p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/token/${item.linkedToken}`}
                              className="financial-value text-pump-text hover:text-pump-accent"
                            >
                              ${poolSymbol(item)}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <RewardPoolDisplay
                              item={item}
                              bnbUsd={bnbUsd}
                              avatarSize={20}
                              showUsd
                              amountClassName="financial-value text-body-sm font-semibold text-pump-text"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={airdropStatusBadgeClass(item.displayStatus)}>
                              {formatAirdropDisplayStatus(item.displayStatus)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-pump-muted">
                            {item.displayStatus === "UPCOMING"
                              ? formatQualifyDateTime(item.qualifyStart)
                              : formatQualifyDateTime(item.qualifyEnd)}
                          </td>
                          <td className="px-4 py-3 financial-value text-pump-text">
                            {timeLeftLabel(item)}
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

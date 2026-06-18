"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shortAddress } from "@/config/chain";
import type { AirdropListItem } from "@/lib/db/airdrops";
import type { AirdropsHomePayload } from "@/lib/airdrops-server";
import {
  airdropStatusBadgeClass,
  formatAirdropDisplayStatus,
  getAirdropDisplayStatus,
  type AirdropDisplayStatus,
} from "@/lib/airdrop-status";
import {
  airdropRewardUsd,
  airdropTimelineProgress,
  formatAirdropReward,
  formatDurationUntil,
  formatQualifyDateTime,
  formatTimeRemaining,
  isEndingSoon,
  showAirdropProgressBar,
} from "@/lib/airdrop-board-format";
import { Plus, Bookmark } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount } from "wagmi";
import { AirdropsSkeleton } from "@/components/airdrops/AirdropsSkeleton";
import { useAirdropSaves } from "@/components/airdrops/AirdropSavesProvider";
import { AirdropsSavedSheet } from "@/components/airdrops/AirdropsSavedSheet";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import { IconLabel, SectionHeadingIcon, TableHeaderLabel } from "@/components/ui/IconLabel";
import { ICON_STROKE } from "@/lib/icons";
import { MetricIcons } from "@/lib/metric-icons";
import { ScrollStripTrack } from "@/components/ui/ScrollStripTrack";
import { RECENT_STRIP_DESKTOP, RECENT_STRIP_MOBILE } from "@/lib/recent-strip-limits";
import { HourglassIcon } from "@/components/ui/HourglassIcon";
import {
  AirdropPoolTokenMetric,
  AirdropProgressMetric,
  AirdropRewardPoolMetric,
  AirdropStatusMetric,
  airdropListRewardProps,
} from "@/components/airdrops/AirdropMetricCells";
import { AirdropGuaranteedBadge } from "@/components/airdrops/AirdropGuaranteedBadge";
import { AirdropMetricsStrip } from "@/components/airdrops/AirdropMetricsStrip";
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
  | "highValue"
  | "saved"
  | "mine";
type SortKey = "reward" | "end" | "start" | "status";
type SortDir = "asc" | "desc";

type EnrichedAirdrop = AirdropListItem & {
  displayStatus: AirdropDisplayStatus;
  rewardNum: number;
  rewardUsd: number;
};

const HIGH_VALUE_THRESHOLD = 10_000;
const ENDING_SOON_HOURS = 48;

const AIRDROP_FILTER_ITEMS = [
  ["all", "All", "All"],
  ["qualifying", "Qualifying", "Qualifying"],
  ["claimable", "Claimable", "Claimable"],
  ["upcoming", "Upcoming", "Upcoming"],
  ["endingSoon", "Ending", "Ending soon"],
  ["ended", "Ended", "Ended"],
  ["highValue", "High", "High value"],
  ["saved", "Saved", "Saved"],
  ["mine", "Joined", "Joined airdrops"],
] as const;

function AirdropFilterChips({
  activeFilter,
  filterCounts,
  onSelect,
}: {
  activeFilter: AirdropFilter;
  filterCounts: Record<string, number>;
  onSelect: (filter: AirdropFilter) => void;
}) {
  return (
    <>
      {AIRDROP_FILTER_ITEMS.map(([key, mobileLabel, desktopLabel]) => {
        const count = filterCounts[key] ?? 0;
        const isSavedTab = key === "saved";
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeFilter === key}
            onClick={() => onSelect(key)}
            className={`arena-filter-chip ${
              activeFilter === key ? "arena-filter-chip-active" : ""
            }${isSavedTab ? " hidden md:inline-flex" : ""}`}
          >
            {isSavedTab ? (
              <>
                <span className="inline-flex items-center gap-1 md:hidden">
                  <Bookmark className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                  <span>({count})</span>
                </span>
                <span className="hidden md:inline">
                  {desktopLabel} ({count})
                </span>
              </>
            ) : (
              <>
                <span className="md:hidden">
                  {mobileLabel} ({count})
                </span>
                <span className="hidden md:inline">
                  {desktopLabel} ({count})
                </span>
              </>
            )}
          </button>
        );
      })}
    </>
  );
}

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

function CreateCampaignLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/airdrops/create"
      prefetch={true}
      className={`${createCampaignButtonClass} inline-flex items-center gap-1.5 ${className}`}
    >
      <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
      <span>Create airdrop</span>
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

function matchesFilter(
  item: EnrichedAirdrop,
  filter: AirdropFilter,
  savedIds: Set<string>,
  mineIds: Set<string>
): boolean {
  if (filter === "saved") return savedIds.has(item.id);
  if (filter === "mine") return mineIds.has(item.id);
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

function airdropShowsCountdown(status: AirdropDisplayStatus): boolean {
  return status === "UPCOMING" || status === "QUALIFYING" || status === "CLAIMABLE";
}

/** Active countdown / phase caption; null when nothing meaningful to show (e.g. closed). */
function airdropTimeCaption(item: EnrichedAirdrop): string | null {
  switch (item.displayStatus) {
    case "UPCOMING":
      return formatDurationUntil(item.qualifyStart);
    case "QUALIFYING":
      return formatTimeRemaining(item.qualifyEnd);
    case "CLAIMABLE":
      return item.claimEnd ? formatTimeRemaining(item.claimEnd) : "Window open";
    case "FINALIZING":
      return "Finalizing winners";
    case "CLOSED":
      return null;
  }
}

function AirdropSaveButton({
  airdropId,
  className = "",
}: {
  airdropId: string;
  className?: string;
}) {
  const { isSaved, toggleSave } = useAirdropSaves();
  const saved = isSaved(airdropId);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSave(airdropId);
      }}
      className={`inline-flex shrink-0 items-center justify-center transition ${
        saved ? "text-pump-accent" : "text-pump-muted hover:text-pump-text"
      } ${className}`}
      aria-label={saved ? "Remove from saved" : "Save campaign"}
    >
      <Bookmark
        className={`h-4 w-4 ${saved ? "fill-current" : ""}`}
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
    </button>
  );
}

function MobileAirdropBoardRow({
  item,
  bnbUsd,
}: {
  item: EnrichedAirdrop;
  bnbUsd: number | null;
}) {
  const symbol = poolSymbol(item);
  const isBnb = !item.rewardToken;
  const usd = airdropRewardUsd(item, bnbUsd);
  const poolLabel = formatAirdropReward(item.totalFunded, {
    isBnb,
    symbol: item.rewardSymbol,
  });
  const timeCaption = airdropTimeCaption(item);
  const href = `/airdrops/${item.id}`;

  return (
    <article className="mobile-airdrop-row relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto] grid-rows-[auto_auto] items-start gap-x-2 gap-y-1 p-2.5 transition active:bg-pump-border/8">
      <Link
        href={href}
        className="absolute inset-0 z-0 rounded-[inherit]"
        aria-label={`${symbol} airdrop`}
      />

      <TokenAvatar
        address={item.linkedToken}
        symbol={symbol}
        size={28}
        className="relative z-10 row-span-2 self-start !ring-0"
      />

      <div className="relative z-10 col-start-2 row-start-1 flex min-w-0 items-center gap-x-1.5">
        <span className="truncate text-body-sm font-semibold text-pump-text">{symbol}</span>
        <span className={`shrink-0 ${airdropStatusBadgeClass(item.displayStatus)}`}>
          {formatAirdropDisplayStatus(item.displayStatus)}
        </span>
      </div>

      <div className="relative z-10 col-start-3 row-start-1 row-span-2 flex flex-col items-end self-stretch">
        <AirdropSaveButton airdropId={item.id} className="h-8 w-8 shrink-0" />
        {timeCaption ? (
          <span className="mt-auto flex shrink-0 items-center gap-1 pt-1 text-[11px] font-medium tabular-nums text-pump-muted">
            {airdropShowsCountdown(item.displayStatus) ? (
              <HourglassIcon size={12} aria-hidden />
            ) : null}
            <span className="financial-value">{timeCaption}</span>
          </span>
        ) : null}
      </div>

      <div className="relative z-10 col-start-2 row-start-2 min-w-0 pr-1 text-[11px] leading-tight">
        <span className="financial-value block min-w-0 truncate font-semibold tabular-nums text-pump-text">
          <span className="font-normal text-pump-muted">Reward </span>
          {poolLabel}
          {usd != null ? (
            <span className="ml-1 font-medium text-pump-muted">
              · {formatUsdReadable(usd, { compact: true })}
            </span>
          ) : null}
        </span>
      </div>
    </article>
  );
}

function HighlightAirdropCard({
  href,
  label,
  item,
  icon,
}: {
  href: string;
  label: string;
  item: EnrichedAirdrop;
  icon: LucideIcon;
}) {
  const symbol = poolSymbol(item);

  return (
    <Link
      href={href}
      className="panel-interactive flex min-w-0 flex-row flex-nowrap items-center justify-between gap-3 p-2.5 md:px-3 md:py-3"
    >
      <IconLabel
        icon={icon}
        className="section-label min-w-0 shrink text-caption md:text-[inherit]"
        iconClassName="h-3 w-3 shrink-0 opacity-75 md:h-3.5 md:w-3.5"
      >
        {label}
      </IconLabel>
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <TokenAvatar address={item.linkedToken} symbol={symbol} size={22} className="md:hidden" />
        <TokenAvatar address={item.linkedToken} symbol={symbol} size={18} className="hidden md:block" />
        <p className="truncate text-caption font-medium text-pump-text">{symbol}</p>
      </div>
    </Link>
  );
}

function HighlightAirdropPlaceholder({ label, icon }: { label: string; icon: LucideIcon }) {
  return (
    <div className="panel-surface flex min-w-0 flex-row flex-nowrap items-center justify-between gap-3 p-2.5 md:px-3 md:py-3">
      <IconLabel
        icon={icon}
        className="section-label min-w-0 shrink text-caption md:text-[inherit]"
        iconClassName="h-3 w-3 shrink-0 opacity-75 md:h-3.5 md:w-3.5"
      >
        {label}
      </IconLabel>
      <p className="shrink-0 text-body-sm text-pump-muted">—</p>
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

export function AirdropsListClient({
  initialPayload = null,
}: {
  initialPayload?: AirdropsHomePayload | null;
}) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();
  const { saves } = useAirdropSaves();
  const [items, setItems] = useState<AirdropListItem[] | null>(initialPayload?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<AirdropFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("reward");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [nowTick, setNowTick] = useState(0);
  const [mineIds, setMineIds] = useState<Set<string>>(new Set());
  const { bnbUsd } = useBnbUsdPrice();

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const initialPayloadRef = useRef(initialPayload);

  useEffect(() => {
    if (initialPayloadRef.current) {
      initialPayloadRef.current = null;
      void load();
      const timer = window.setInterval(() => void load(), 30_000);
      return () => window.clearInterval(timer);
    }

    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!address) {
      setMineIds(new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/airdrops/mine?address=${encodeURIComponent(address)}&idsOnly=1&limit=500`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          data?: Array<{ id: string } | string>;
        };
        if (!cancelled && res.ok && Array.isArray(json.data)) {
          setMineIds(
            new Set(json.data.map((entry) => (typeof entry === "string" ? entry : entry.id)))
          );
        }
      } catch {
        if (!cancelled) setMineIds(new Set());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

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

  const largestReward = useMemo(() => {
    const active = resolvedItems.filter(
      (item) =>
        item.displayStatus === "QUALIFYING" || item.displayStatus === "UPCOMING"
    );
    return [...active].sort((a, b) => b.rewardUsd - a.rewardUsd)[0] ?? null;
  }, [resolvedItems]);

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
      qualifying: resolvedItems.filter((i) => matchesFilter(i, "qualifying", saves, mineIds)).length,
      claimable: resolvedItems.filter((i) => matchesFilter(i, "claimable", saves, mineIds)).length,
      upcoming: resolvedItems.filter((i) => matchesFilter(i, "upcoming", saves, mineIds)).length,
      endingSoon: resolvedItems.filter((i) => matchesFilter(i, "endingSoon", saves, mineIds)).length,
      ended: resolvedItems.filter((i) => matchesFilter(i, "ended", saves, mineIds)).length,
      highValue: resolvedItems.filter((i) => matchesFilter(i, "highValue", saves, mineIds)).length,
      saved: resolvedItems.filter((i) => matchesFilter(i, "saved", saves, mineIds)).length,
      mine: resolvedItems.filter((i) => matchesFilter(i, "mine", saves, mineIds)).length,
    };
  }, [resolvedItems, saves, mineIds]);

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
      return matchesFilter(item, activeFilter, saves, mineIds);
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
  }, [resolvedItems, search, activeFilter, sortKey, sortDir, saves, mineIds]);

  const walletFilterActive =
    (activeFilter === "saved" || activeFilter === "mine") && !isConnected;

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
      <div className="panel-surface empty-state">
        <p className="empty-state-copy">No active airdrop campaigns yet.</p>
        <CreateCampaignLink className="mt-4 h-10 px-5 text-body-sm" />
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {featured ? (
        <section className="space-y-2 md:space-y-3">
          <SectionHeadingIcon icon={MetricIcons.featured}>Featured campaign</SectionHeadingIcon>

          <Link
            href={`/airdrops/${featured.id}`}
            className="koth-banner panel-surface block"
          >
            <div className="koth-banner__inner featured-airdrop-banner__inner">
              <div className="featured-airdrop-banner__identity min-w-0">
                <TokenAvatar
                  address={featured.linkedToken}
                  symbol={poolSymbol(featured)}
                  size={48}
                  className="koth-banner__logo shrink-0 md:hidden"
                />
                <TokenAvatar
                  address={featured.linkedToken}
                  symbol={poolSymbol(featured)}
                  size={60}
                  className="koth-banner__logo hidden shrink-0 md:block"
                />

                <div className="featured-airdrop-banner__lead min-w-0 flex-1">
                  <div className="featured-airdrop-banner__headline-row">
                    <p className="featured-airdrop-banner__title truncate">
                      {campaignTitle(featured)}
                    </p>
                    <div className="featured-airdrop-banner__badges flex shrink-0 items-center gap-1.5">
                      <AirdropGuaranteedBadge />
                      <AirdropStatusMetric status={featured.displayStatus} />
                    </div>
                  </div>
                </div>
              </div>

              <AirdropMetricsStrip
                variant="hero"
                className="featured-airdrop-banner__metrics min-w-0"
                reward={
                  <AirdropRewardPoolMetric {...airdropListRewardProps(featured, bnbUsd)} />
                }
                progress={
                  <AirdropProgressMetric
                    timeLabel={
                      nowTick >= 0 ? (airdropTimeCaption(featured) ?? "Ended") : "—"
                    }
                    progressPct={airdropTimelineProgress(
                      featured.displayStatus,
                      featured.qualifyStart,
                      featured.qualifyEnd,
                      featured.claimEnd
                    )}
                    showBar={showAirdropProgressBar(featured.displayStatus)}
                    showIcon={airdropShowsCountdown(featured.displayStatus)}
                  />
                }
                poolToken={
                  <AirdropPoolTokenMetric
                    tokenAddress={featured.linkedToken}
                    symbol={poolSymbol(featured)}
                  />
                }
                status={<AirdropStatusMetric status={featured.displayStatus} />}
              />
            </div>
          </Link>

          {resolvedItems.length > 1 ? (
            <div className="scroll-strip-row">
              <IconLabel
                icon={MetricIcons.recent}
                hideIconMobile
                className="section-label shrink-0 text-caption md:text-[inherit]"
              >
                More
              </IconLabel>
              <ScrollStripTrack aria-label="More airdrops">
                {resolvedItems
                  .filter((item) => item.id !== featured.id)
                  .slice(0, RECENT_STRIP_DESKTOP)
                  .map((item, index) => (
                    <Link
                      key={item.id}
                      href={`/airdrops/${item.id}`}
                      className={`contender-chip${index >= RECENT_STRIP_MOBILE ? " hidden md:inline-flex" : ""}`}
                    >
                      <TokenAvatar
                        address={item.linkedToken}
                        symbol={poolSymbol(item)}
                        size={16}
                        className="md:hidden"
                      />
                      <TokenAvatar
                        address={item.linkedToken}
                        symbol={poolSymbol(item)}
                        size={18}
                        className="hidden md:block"
                      />
                      <span className="text-caption text-pump-text">{poolSymbol(item)}</span>
                    </Link>
                  ))}
              </ScrollStripTrack>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-3">
        <div className="panel-surface flex min-w-0 flex-row flex-nowrap items-center justify-between gap-3 p-2.5 md:px-3 md:py-3">
          <IconLabel
            icon={MetricIcons.totalRewards}
            className="section-label min-w-0 shrink text-caption md:text-[inherit]"
            iconClassName="h-3 w-3 shrink-0 opacity-75 md:h-3.5 md:w-3.5"
          >
            Total rewards
          </IconLabel>
          <div className="flex min-w-0 shrink items-baseline justify-end gap-1.5 text-right">
            <p className="financial-value shrink-0 text-body-sm font-semibold text-pump-text">
              {stats.totalUsd != null ? formatUsdReadable(stats.totalUsd, { compact: true }) : "—"}
            </p>
            <span className="truncate text-caption text-pump-muted">
              <span className="md:hidden">USD est.</span>
              <span className="hidden md:inline">
                {resolvedItems.length} campaigns · USD est.
              </span>
            </span>
          </div>
        </div>

        {largestReward ? (
          <HighlightAirdropCard
            href={`/airdrops/${largestReward.id}`}
            label="Largest pool"
            item={largestReward}
            icon={MetricIcons.largestPool}
          />
        ) : (
          <HighlightAirdropPlaceholder label="Largest pool" icon={MetricIcons.largestPool} />
        )}

        {endingSoonest ? (
          <HighlightAirdropCard
            href={`/airdrops/${endingSoonest.id}`}
            label="Ending soon"
            item={endingSoonest}
            icon={MetricIcons.endingSoon}
          />
        ) : (
          <HighlightAirdropPlaceholder label="Ending soon" icon={MetricIcons.endingSoon} />
        )}
      </section>

      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionHeadingIcon icon={MetricIcons.exploreAirdrops}>Explore airdrops</SectionHeadingIcon>
          <CreateCampaignLink className="h-8 px-2.5 text-caption md:hidden" />
          <CreateCampaignLink className="hidden h-9 whitespace-nowrap px-4 text-body-sm md:inline-flex" />
        </div>

        <div className="arena-toolbar">
          <div className="arena-search-group">
            <div className="arena-toolbar-search">
              <FieldSearchInput
                embedded
                fieldOnly
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaigns"
              />
            </div>
          </div>
          <div className="arena-toolbar-watchlist shrink-0 md:hidden">
            <AirdropsSavedSheet items={resolvedItems} bnbUsd={bnbUsd} />
          </div>
          <div className="arena-filter-bar-wrap hidden md:block">
            <div className="arena-filter-bar" role="tablist" aria-label="Airdrop filters">
              <AirdropFilterChips
                activeFilter={activeFilter}
                filterCounts={filterCounts}
                onSelect={setActiveFilter}
              />
            </div>
          </div>
        </div>

        <div className="arena-filter-bar-wrap md:hidden">
          <div className="arena-filter-bar" role="tablist" aria-label="Airdrop filters">
            <AirdropFilterChips
              activeFilter={activeFilter}
              filterCounts={filterCounts}
              onSelect={setActiveFilter}
            />
          </div>
        </div>

        <section className="panel-surface overflow-hidden">
          {walletFilterActive ? (
            <div className="p-8 text-center">
              <p className="text-body-sm text-pump-muted">
                Connect your wallet to view{" "}
                {activeFilter === "saved" ? "saved campaigns" : "joined airdrops"}.
              </p>
              <button
                type="button"
                className="primary-button mt-4 h-10 px-5 text-body-sm"
                onClick={() => openConnectModal?.()}
              >
                Connect wallet
              </button>
            </div>
          ) : boardItems.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-pump-muted">
              {activeFilter === "saved"
                ? "No saved campaigns yet. Tap the bookmark on any campaign to save it."
                : activeFilter === "mine"
                  ? "No joined airdrops yet. Complete on-chain requirements during qualify to track progress here."
                  : activeFilter === "claimable"
                    ? "No campaigns in the claimable phase. Winners can claim after qualify ends and results are finalized."
                    : activeFilter === "qualifying"
                      ? "No campaigns open for qualify right now."
                      : "No campaigns match your filters."}
            </div>
          ) : (
            <>
              <div className="sheet-list lg:hidden">
                {boardItems.map((item) => (
                  <MobileAirdropBoardRow key={item.id} item={item} bnbUsd={bnbUsd} />
                ))}
              </div>

              <div className="hidden lg:block overflow-x-auto">
                <table className="sheet-grid min-w-[960px]">
                  <thead>
                    <tr>
                      <th className="w-10" aria-label="Save" />
                      <th>Campaign</th>
                      <th>Pool</th>
                      <th>
                        <button type="button" onClick={() => onSort("reward")} className={sortHeadClass("reward")}>
                          <TableHeaderLabel icon={MetricIcons.rewardPool}>Reward pool</TableHeaderLabel> {sortLabel("reward")}
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => onSort("status")} className={sortHeadClass("status")}>
                          <TableHeaderLabel icon={MetricIcons.status}>Status</TableHeaderLabel> {sortLabel("status")}
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => onSort("end")} className={sortHeadClass("end")}>
                          <TableHeaderLabel icon={MetricIcons.endingSoon}>Deadline</TableHeaderLabel> {sortLabel("end")}
                        </button>
                      </th>
                      <th>
                        <TableHeaderLabel icon={MetricIcons.progress}>Time left</TableHeaderLabel>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {boardItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-2 py-3">
                            <AirdropSaveButton airdropId={item.id} className="h-8 w-8" />
                          </td>
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
                              <div className="min-w-0">
                                <p className="truncate font-medium text-pump-text">{poolSymbol(item)}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/token/${item.linkedToken}`}
                              className="financial-value text-pump-text hover:text-pump-accent"
                            >
                              {poolSymbol(item)}
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
                            {airdropTimeCaption(item) ?? "Ended"}
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

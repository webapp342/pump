"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TokenHolderSnapshot, TradeItem } from "@/lib/db/launchpad";
import { explorerTxUrl, shortAddress } from "@/config/chain";
import { PumpIcon, faArrowDown, faArrowUp, faClock, faExternalLink, faWellness } from "@/lib/icons";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { PctChange } from "@/components/ui/PctChange";
import { ACTIVITY_PAGE_SIZE } from "@/lib/activity-page-size";
import { normalizeRouteAddressKey } from "@/lib/address";
import { PumpSubscriptPrice } from "@/components/ui/PumpSubscriptPrice";
import { formatAge, formatArenaQuoteUsd } from "@/lib/arena-board-format";
import {
  DEFAULT_TOKEN_TOTAL_SUPPLY,
  bnbToUsd,
  estimateFdvUsd,
  formatUsdReadable,
  tradeFillPriceUsd,
  tradeNetUsdForDisplay,
  positionAvgEntryUsd,
  positionUnrealizedUsd,
  positionUnrealizedPct,
  scaleCostBasisUsdForBalance,
} from "@/lib/format-usd";
import {
  resolveVerifiedTokenBalance,
  scaleCostBasisForBalance,
} from "@/lib/onchain-balance";
import { useLiveTradeAnimations } from "@/hooks/useLiveTradeAnimations";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import { useUserDisplayNames } from "@/hooks/useUserDisplayNames";
import { CreatorRewardsCard } from "@/components/creators/CreatorRewardsCard";
import { TokenAnnouncementsPanel } from "@/components/token/TokenAnnouncementsPanel";

type ActivityTab = "holders" | "trades" | "social" | "about";

export type TradeTapeTab = ActivityTab;

type HolderRow = {
  address: string;
  displayUsername?: string;
  netTokens: number;
  remainingCostBasisBnb: number;
  remainingCostBasisUsd: number;
  avgEntryBnb: number | null;
  heldSince?: string | null;
};

type PagedMeta = {
  hasMore: boolean;
  offset: number;
};

const activityTableScrollClass = "token-tape-table-wrap";

const DESKTOP_TAPE_TABS: ReadonlyArray<{ id: ActivityTab; label: string }> = [
  { id: "trades", label: "Trades" },
  { id: "holders", label: "Holders" },
];

const MOBILE_TAPE_TABS: ReadonlyArray<{ id: ActivityTab; label: string }> = [
  { id: "trades", label: "Trades" },
  { id: "holders", label: "Holders" },
  { id: "social", label: "Callouts" },
  { id: "about", label: "About" },
];

function ultraShortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-2)}`;
}

function formatTokenAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(2);
  if (value > 0) return value.toFixed(4);
  return "0";
}

function formatSupplyShare(balance: number): string {
  const pct = (balance / DEFAULT_TOKEN_TOTAL_SUPPLY) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(4)}%`;
}

function formatSupplyShareMobile(balance: number): string {
  const pct = (balance / DEFAULT_TOKEN_TOTAL_SUPPLY) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

/** FDV/MC at trade using spot (or fill) × supply × trade-time FX when available. */
function tradeMarketCapUsd(trade: TradeItem, liveBnbUsd: number | null): number | null {
  const spot = Number(trade.spotPriceBnb ?? trade.priceBnb);
  if (!Number.isFinite(spot) || spot <= 0) return null;
  const frozen = Number(trade.nativeUsdRate);
  const rate =
    Number.isFinite(frozen) && frozen > 0 ? frozen : liveBnbUsd;
  return estimateFdvUsd(spot, rate);
}

type HolderMetrics = {
  avgEntryUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
  pnlTone: string;
};

function computeHolderMetrics(
  row: HolderRow,
  currentPriceBnb: number,
  bnbUsd: number | null
): HolderMetrics {
  const avgEntryUsd = positionAvgEntryUsd(
    row.netTokens,
    row.remainingCostBasisUsd,
    row.remainingCostBasisBnb,
    bnbUsd
  );
  const unrealizedPnlUsd = positionUnrealizedUsd(
    row.netTokens,
    currentPriceBnb,
    row.remainingCostBasisUsd,
    row.remainingCostBasisBnb,
    bnbUsd
  );
  const unrealizedPnlPct = positionUnrealizedPct(
    unrealizedPnlUsd,
    row.remainingCostBasisUsd,
    row.remainingCostBasisBnb,
    bnbUsd
  );
  const pnlTone =
    unrealizedPnlUsd == null
      ? "text-pump-muted"
      : unrealizedPnlUsd >= 0
        ? "text-pump-success"
        : "text-pump-danger";

  return { avgEntryUsd, unrealizedPnlUsd, unrealizedPnlPct, pnlTone };
}

function mergeTradesByTxHash(...groups: TradeItem[][]): TradeItem[] {
  const seen = new Set<string>();
  const merged: TradeItem[] = [];
  for (const group of groups) {
    for (const trade of group) {
      const key = trade.txHash.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trade);
    }
  }
  return merged.sort(
    (a, b) => new Date(b.blockTime).getTime() - new Date(a.blockTime).getTime()
  );
}

function mapApiHoldersToRows(holders: TokenHolderSnapshot[]): HolderRow[] {
  return holders
    .flatMap((holder) => {
      const indexedBalance = Number(holder.tokenBalance);
      const onChainBalance =
        holder.onChainBalance != null ? Number(holder.onChainBalance) : undefined;
      const { displayBalance, hidden } = resolveVerifiedTokenBalance(
        indexedBalance,
        onChainBalance
      );
      if (hidden) return [];

      const fullCostBasis = Math.max(0, Number(holder.remainingCostBasisBnb));
      const fullCostBasisUsd = Math.max(0, Number(holder.remainingCostBasisUsd ?? 0));
      const remainingCostBasisBnb = scaleCostBasisForBalance(
        fullCostBasis,
        indexedBalance,
        displayBalance
      );
      const remainingCostBasisUsd = scaleCostBasisUsdForBalance(
        fullCostBasisUsd,
        indexedBalance,
        displayBalance
      );

      const row: HolderRow = {
        address: holder.address,
        netTokens: displayBalance,
        remainingCostBasisBnb,
        remainingCostBasisUsd,
        avgEntryBnb:
          displayBalance > 0 ? remainingCostBasisBnb / displayBalance : null,
        heldSince: holder.heldSince ?? null,
      };
      if (holder.displayUsername) {
        row.displayUsername = holder.displayUsername;
      }
      return [row];
    })
    .sort((a, b) => b.netTokens - a.netTokens);
}

function mergeHolderRows(existing: HolderRow[], incoming: HolderRow[]): HolderRow[] {
  const byAddress = new Map<string, HolderRow>();
  for (const row of existing) {
    byAddress.set(normalizeRouteAddressKey(row.address), row);
  }
  for (const row of incoming) {
    byAddress.set(normalizeRouteAddressKey(row.address), row);
  }
  return [...byAddress.values()].sort((a, b) => b.netTokens - a.netTokens);
}

function CreatorBadge() {
  return (
    <span
      className="token-tape-creator-icon inline-flex shrink-0 items-center justify-center text-pump-accent"
      title="Creator"
      aria-label="Creator"
    >
      <PumpIcon icon={faWellness} className="token-tape-creator-icon__glyph" aria-hidden />
    </span>
  );
}

function TradeSideMark({ side }: { side: string }) {
  const isBuy = side === "BUY";
  return (
    <span
      className={`token-trade-side${
        isBuy ? " token-trade-side--buy" : " token-trade-side--sell"
      }`}
    >
      <span className="token-trade-side__icon" aria-hidden>
        <PumpIcon icon={isBuy ? faArrowUp : faArrowDown} size="xs" />
      </span>
      <span className="token-trade-side__label">{isBuy ? "Buy" : "Sell"}</span>
    </span>
  );
}

function IdentityPill({
  address,
  displayUsername,
  hasStatusBadge = false,
  showCreatorBadge = false,
  onAddressClick,
  compact = false,
}: {
  address: string;
  displayUsername?: string;
  hasStatusBadge?: boolean;
  showCreatorBadge?: boolean;
  onAddressClick: (address: string) => void;
  compact?: boolean;
}) {
  const label =
    displayUsername ??
    (compact ? ultraShortAddress(address) : shortAddress(address, true));
  return (
    <button
      type="button"
      onClick={() => onAddressClick(address)}
      className={compact ? "token-tape-identity token-tape-identity--compact" : "token-tape-identity"}
      aria-label={`View profile ${label}${showCreatorBadge ? ", creator" : ""}${hasStatusBadge ? ", profile frame" : ""}`}
    >
      <UserAvatarForAddress
        address={address}
        size={compact ? 16 : 18}
        framed={hasStatusBadge}
        className="shrink-0"
      />
      <span
        className={`token-tape-identity__label${
          hasStatusBadge ? " identity-name--premium" : ""
        }`}
      >
        {label}
      </span>
      {showCreatorBadge ? <CreatorBadge /> : null}
    </button>
  );
}

function LoadMoreSentinel({
  loading,
  label,
}: {
  loading: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-center py-3 text-caption text-pump-muted">
      {loading ? label : null}
    </div>
  );
}

export function TradeTape({
  tokenAddress,
  creatorAddress,
  symbol,
  logoUrl = null,
  headTrades,
  wsConnected = false,
  holdersRefreshKey = 0,
  initialHolders,
  currentPriceBnb,
  currentMarketCapBnb = null,
  bnbUsd,
  onAddressClick,
  activeTab: activeTabProp,
  onActiveTabChange,
  hideTabBar = false,
  mobileStickyHead = false,
  flowLayout = false,
  creatorDisplayUsername,
  launchTxHash = "",
  followerCount = 0,
  tokenDescription,
  announcementsRefreshKey = 0,
}: {
  tokenAddress: string;
  creatorAddress: string;
  symbol: string;
  logoUrl?: string | null;
  /** Latest trades from live poll + optimistic layer (tape head). */
  headTrades: TradeItem[];
  wsConnected?: boolean;
  holdersRefreshKey?: number;
  initialHolders?: TokenHolderSnapshot[];
  currentPriceBnb: number;
  /** Live mcap already on token page — drives callout X badge client-side. */
  currentMarketCapBnb?: number | string | null;
  bnbUsd: number | null;
  onAddressClick: (address: string) => void;
  /** Parent-controlled tab (mobile main tabs). */
  activeTab?: TradeTapeTab;
  onActiveTabChange?: (tab: TradeTapeTab) => void;
  hideTabBar?: boolean;
  /** Mobile main tabs — sticky thead, body scrolls in flex slot. */
  mobileStickyHead?: boolean;
  /** Mobile stacked feed — expand with content; parent scrolls. */
  flowLayout?: boolean;
  creatorDisplayUsername?: string;
  launchTxHash?: string;
  followerCount?: number;
  tokenDescription?: string | null;
  announcementsRefreshKey?: number;
}) {
  const creatorKey = creatorAddress.toLowerCase();
  const [internalTab, setInternalTab] = useState<ActivityTab>("trades");
  const tab = activeTabProp ?? internalTab;

  const setTab = useCallback(
    (next: ActivityTab) => {
      if (activeTabProp == null) setInternalTab(next);
      onActiveTabChange?.(next);
    },
    [activeTabProp, onActiveTabChange]
  );

  const [olderTrades, setOlderTrades] = useState<TradeItem[]>([]);
  const [tradeOffset, setTradeOffset] = useState(ACTIVITY_PAGE_SIZE);
  const [hasMoreTrades, setHasMoreTrades] = useState(headTrades.length >= ACTIVITY_PAGE_SIZE);
  const [loadingMoreTrades, setLoadingMoreTrades] = useState(false);

  const [holderRows, setHolderRows] = useState<HolderRow[]>(() =>
    initialHolders?.length ? mapApiHoldersToRows(initialHolders) : []
  );
  const [holderOffset, setHolderOffset] = useState(
    initialHolders?.length ? initialHolders.length : ACTIVITY_PAGE_SIZE
  );
  const [hasMoreHolders, setHasMoreHolders] = useState(
    Boolean(initialHolders && initialHolders.length >= ACTIVITY_PAGE_SIZE)
  );
  const [loadingMoreHolders, setLoadingMoreHolders] = useState(false);
  const [holdersReady, setHoldersReady] = useState(
    Boolean(initialHolders && initialHolders.length > 0)
  );
  const [ageNowMs, setAgeNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (tab !== "trades") return;
    setAgeNowMs(Date.now());
    const id = window.setInterval(() => setAgeNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [tab]);

  const displayedTrades = useMemo(
    () => mergeTradesByTxHash(headTrades, olderTrades),
    [headTrades, olderTrades]
  );

  const displayNameAddresses = useMemo(
    () => [
      ...displayedTrades.map((trade) => trade.traderAddress),
      ...holderRows.map((holder) => holder.address),
    ],
    [displayedTrades, holderRows]
  );
  const displayNameLookup = useUserDisplayNames(displayNameAddresses, true);

  const tradeIds = useMemo(() => displayedTrades.map((t) => t.id), [displayedTrades]);
  const { rowClass: tradeRowClass } = useLiveTradeAnimations(tradeIds);

  const loadMoreTrades = useCallback(async () => {
    if (loadingMoreTrades || !hasMoreTrades) return;
    setLoadingMoreTrades(true);
    try {
      const response = await fetch(
        `/api/tokens/${tokenAddress}/trades?limit=${ACTIVITY_PAGE_SIZE}&offset=${tradeOffset}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as {
        data?: TradeItem[];
        meta?: PagedMeta;
      };
      if (!response.ok) return;
      const next = body.data ?? [];
      setOlderTrades((prev) => mergeTradesByTxHash(prev, next));
      setTradeOffset((prev) => prev + next.length);
      setHasMoreTrades(body.meta?.hasMore ?? next.length >= ACTIVITY_PAGE_SIZE);
    } finally {
      setLoadingMoreTrades(false);
    }
  }, [hasMoreTrades, loadingMoreTrades, tokenAddress, tradeOffset]);

  const fetchHoldersPage = useCallback(
    async (offset: number, append: boolean, options?: { fresh?: boolean }) => {
      const fresh = options?.fresh === true;
      const qs = new URLSearchParams({
        limit: String(ACTIVITY_PAGE_SIZE),
        offset: String(offset),
      });
      // Bust in-memory API cache after trades — SSR refresh already bypasses it.
      if (fresh) qs.set("fresh", "1");
      const response = await fetch(
        `/api/tokens/${tokenAddress}/holders?${qs.toString()}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as {
        data?: TokenHolderSnapshot[];
        meta?: PagedMeta;
      };
      if (!response.ok) return null;
      const rows = mapApiHoldersToRows(body.data ?? []);
      setHolderRows((prev) => {
        if (append) return mergeHolderRows(prev, rows);
        if (offset === 0 && prev.length > ACTIVITY_PAGE_SIZE) {
          return mergeHolderRows(rows, prev.slice(ACTIVITY_PAGE_SIZE));
        }
        return rows;
      });
      setHolderOffset(offset + rows.length);
      setHasMoreHolders(body.meta?.hasMore ?? rows.length >= ACTIVITY_PAGE_SIZE);
      setHoldersReady(true);
      return rows;
    },
    [tokenAddress]
  );

  const loadMoreHolders = useCallback(async () => {
    if (loadingMoreHolders || !hasMoreHolders) return;
    setLoadingMoreHolders(true);
    try {
      await fetchHoldersPage(holderOffset, true);
    } finally {
      setLoadingMoreHolders(false);
    }
  }, [fetchHoldersPage, hasMoreHolders, holderOffset, loadingMoreHolders]);

  const tradeSentinelRef = useInfiniteScrollSentinel({
    enabled: tab === "trades",
    hasMore: hasMoreTrades,
    loading: loadingMoreTrades,
    onLoadMore: loadMoreTrades,
  });

  const holderSentinelRef = useInfiniteScrollSentinel({
    enabled: tab === "holders",
    hasMore: hasMoreHolders,
    loading: loadingMoreHolders,
    onLoadMore: loadMoreHolders,
  });

  useEffect(() => {
    if (initialHolders?.length) {
      setHolderRows(mapApiHoldersToRows(initialHolders));
      setHolderOffset(initialHolders.length);
      setHasMoreHolders(initialHolders.length >= ACTIVITY_PAGE_SIZE);
      setHoldersReady(true);
    }
  }, [initialHolders]);

  useEffect(() => {
    if (initialHolders?.length) return;
    let cancelled = false;

    void (async () => {
      const rows = await fetchHoldersPage(0, false);
      if (!cancelled && rows == null) {
        setHolderRows([]);
        setHoldersReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchHoldersPage, initialHolders?.length, tokenAddress]);

  useEffect(() => {
    if (tab !== "holders") return;
    // Immediate fresh pull when opening the tab (SSR snapshot can be stale vs live trades).
    void fetchHoldersPage(0, false, { fresh: true });
    if (!wsConnected) return;
    const timer = window.setInterval(() => {
      void fetchHoldersPage(0, false, { fresh: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [fetchHoldersPage, tab, tokenAddress, wsConnected]);

  useEffect(() => {
    if (holdersRefreshKey <= 0) return;
    // Indexer writes positions before WS fan-out; still give a short settle window.
    const timer = window.setTimeout(() => {
      void fetchHoldersPage(0, false, { fresh: true });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fetchHoldersPage, holdersRefreshKey]);

  const tapeTabs = mobileStickyHead ? MOBILE_TAPE_TABS : DESKTOP_TAPE_TABS;

  return (
    <section
      className={`panel-surface token-trade-tape token-trade-tape--sticky-head overflow-hidden${
        flowLayout ? " token-trade-tape--flow" : ""
      }${mobileStickyHead ? " token-trade-tape--mobile-tabs" : ""}`}
    >
      {hideTabBar ? null : (
        <div
          className={
            mobileStickyHead
              ? "trade-panel-mode-tabs trade-panel-mode-tabs--scroll shrink-0"
              : "trade-panel-mode-tabs shrink-0"
          }
          role="tablist"
          aria-label={mobileStickyHead ? "Token activity" : "Trades and holders"}
        >
          {tapeTabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={
                tab === id
                  ? "trade-panel-mode-tab trade-panel-mode-tab--active"
                  : "trade-panel-mode-tab"
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="token-trade-tape__scroll scrollbar-corporate">
        {tab === "social" ? (
          <TokenAnnouncementsPanel
            tokenAddress={tokenAddress}
            refreshKey={announcementsRefreshKey}
            onOpenProfile={onAddressClick}
            variant="tape"
            currentMarketCapBnb={currentMarketCapBnb}
            bnbUsd={bnbUsd}
          />
        ) : tab === "about" ? (
          <div className="token-tape-about-panel">
            <CreatorRewardsCard
              creatorAddress={creatorAddress}
              creatorDisplayUsername={creatorDisplayUsername}
              launchTxHash={launchTxHash}
              followerCount={followerCount}
              onAddressClick={onAddressClick}
              layout="tape"
            />
            {tokenDescription?.trim() ? (
              <section className="token-tape-about-description">
                <p className="section-label">Description</p>
                <p className="token-tape-about-description__copy">{tokenDescription.trim()}</p>
              </section>
            ) : null}
          </div>
        ) : tab === "holders" ? (
          !holdersReady ? (
            <p className="token-tape-empty">Verifying holders on-chain…</p>
          ) : holderRows.length === 0 ? (
            <p className="token-tape-empty">No holders yet.</p>
          ) : mobileStickyHead ? (
            <div className={`${activityTableScrollClass} token-holders-mobile`}>
              <ul className="token-holders-mobile__list" aria-label="Holders">
                {holderRows.map((row) => {
                  const { unrealizedPnlPct } = computeHolderMetrics(
                    row,
                    currentPriceBnb,
                    bnbUsd
                  );
                  const balanceUsd = bnbToUsd(row.netTokens * currentPriceBnb, bnbUsd);
                  const meta = displayNameLookup.get(row.address.toLowerCase());
                  const label =
                    row.displayUsername ??
                    meta?.label ??
                    shortAddress(row.address, true);
                  const isCreator = row.address.toLowerCase() === creatorKey;

                  return (
                    <li key={row.address} className="token-holders-mobile__row">
                      <button
                        type="button"
                        className="token-holders-mobile__identity"
                        onClick={() => onAddressClick(row.address)}
                        aria-label={`View profile ${label}${isCreator ? ", creator" : ""}`}
                      >
                        <UserAvatarForAddress
                          address={row.address}
                          size="2xl"
                          framed={Boolean(meta?.hasStatusBadge)}
                          className="token-holders-mobile__avatar"
                        />
                        <span className="token-holders-mobile__copy">
                          <span className="token-holders-mobile__name-row">
                            <span
                              className={`token-holders-mobile__name${
                                meta?.hasStatusBadge ? " identity-name--premium" : ""
                              }`}
                            >
                              {label}
                            </span>
                            {isCreator ? <CreatorBadge /> : null}
                          </span>
                          {row.heldSince ? (
                            <span className="token-holders-mobile__held">
                              <PumpIcon icon={faClock} size="xs" aria-hidden />
                              <span>Held {formatAge(row.heldSince)}</span>
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <div className="token-holders-mobile__stats">
                        <div className="token-holders-mobile__stats-top">
                          <span className="token-holders-mobile__share financial-value">
                            {formatSupplyShareMobile(row.netTokens)}
                          </span>
                          <span className="token-holders-mobile__sep" aria-hidden />
                          <span className="token-holders-mobile__balance financial-value">
                            {formatUsdReadable(balanceUsd, {
                              compact: true,
                              twoDecimalsUnder: 10_000,
                            })}
                          </span>
                        </div>
                        <PctChange
                          value={unrealizedPnlPct}
                          className="token-holders-mobile__pnl"
                          hideWhenEmpty
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div ref={holderSentinelRef}>
                <LoadMoreSentinel loading={loadingMoreHolders} label="Loading holders…" />
              </div>
            </div>
          ) : (
            <div className={activityTableScrollClass}>
              <table className="token-tape-table token-tape-table--holders">
                <thead>
                  <tr>
                    <th className="token-tape-table__col-rank">#</th>
                    <th>Account</th>
                    <th className="token-tape-table__col-num">Amount</th>
                    <th className="token-tape-table__col-num">Supply</th>
                    <th className="token-tape-table__col-num">Entry</th>
                    <th className="token-tape-table__col-num">Value</th>
                    <th className="token-tape-table__col-end">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {holderRows.map((row, index) => {
                    const { avgEntryUsd, unrealizedPnlUsd, pnlTone } =
                      computeHolderMetrics(row, currentPriceBnb, bnbUsd);
                    const valueUsd = bnbToUsd(row.netTokens * currentPriceBnb, bnbUsd);

                    return (
                      <tr key={row.address}>
                        <td className="token-tape-table__col-rank financial-value">
                          {index + 1}
                        </td>
                        <td className="token-tape-table__account">
                          <IdentityPill
                            address={row.address}
                            displayUsername={
                              row.displayUsername ??
                              displayNameLookup.get(row.address.toLowerCase())?.label
                            }
                            hasStatusBadge={
                              displayNameLookup.get(row.address.toLowerCase())
                                ?.hasStatusBadge
                            }
                            showCreatorBadge={row.address.toLowerCase() === creatorKey}
                            onAddressClick={onAddressClick}
                          />
                        </td>
                        <td className="token-tape-table__col-num token-tape-table__value financial-value token-tape-table__cell-amount">
                          {formatTokenAmount(row.netTokens)}
                        </td>
                        <td className="token-tape-table__col-num token-tape-table__value financial-value token-tape-table__muted">
                          {formatSupplyShare(row.netTokens)}
                        </td>
                        <td className="token-tape-table__col-num token-tape-table__value financial-value token-tape-table__muted">
                          <PumpSubscriptPrice value={avgEntryUsd} />
                        </td>
                        <td className="token-tape-table__col-num token-tape-table__value financial-value token-tape-table__cell-value">
                          {formatUsdReadable(valueUsd, {
                            compact: true,
                            twoDecimalsUnder: 10_000,
                          })}
                        </td>
                        <td
                          className={`token-tape-table__col-end token-tape-table__value financial-value font-medium ${pnlTone}`}
                        >
                          {formatUsdReadable(unrealizedPnlUsd, {
                            compact: true,
                            signed: true,
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div ref={holderSentinelRef}>
                <LoadMoreSentinel loading={loadingMoreHolders} label="Loading holders…" />
              </div>
            </div>
          )
        ) : displayedTrades.length === 0 ? (
          <p className="token-tape-empty">No trades yet.</p>
        ) : mobileStickyHead && tab === "trades" ? (
          <div className={`${activityTableScrollClass} token-trades-mobile`}>
            <ul className="token-trades-mobile__list" aria-label="Trades">
              {displayedTrades.map((trade) => {
                const isBuy = trade.side === "BUY";
                const isOptimistic = trade.id.startsWith("optimistic:");
                const tradeNetUsd = tradeNetUsdForDisplay(trade, bnbUsd);
                const mcapUsd = tradeMarketCapUsd(trade, bnbUsd);
                const meta = displayNameLookup.get(trade.traderAddress.toLowerCase());
                const label =
                  trade.traderDisplayUsername ??
                  meta?.label ??
                  shortAddress(trade.traderAddress, true);
                const isCreator = trade.traderAddress.toLowerCase() === creatorKey;

                return (
                  <li
                    key={trade.id}
                    className={`token-trades-mobile__row${
                      isOptimistic ? " token-trades-mobile__row--optimistic" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="token-trades-mobile__identity"
                      onClick={() => onAddressClick(trade.traderAddress)}
                      aria-label={`View profile ${label}${isCreator ? ", creator" : ""}`}
                    >
                      <UserAvatarForAddress
                        address={trade.traderAddress}
                        size="2xl"
                        framed={Boolean(meta?.hasStatusBadge)}
                        className="token-trades-mobile__avatar"
                      />
                      <span className="token-trades-mobile__copy">
                        <span className="token-trades-mobile__name-row">
                          <span
                            className={`token-trades-mobile__name${
                              meta?.hasStatusBadge ? " identity-name--premium" : ""
                            }`}
                          >
                            {label}
                          </span>
                          {isCreator ? <CreatorBadge /> : null}
                          <TradeSideMark side={trade.side} />
                        </span>
                        <span className="token-trades-mobile__meta">
                          <span
                            className={`token-trades-mobile__value financial-value${
                              isBuy
                                ? " token-trades-mobile__value--buy"
                                : " token-trades-mobile__value--sell"
                            }`}
                          >
                            {formatArenaQuoteUsd(tradeNetUsd)}
                          </span>
                          <span className="token-trades-mobile__dot" aria-hidden>
                            ·
                          </span>
                          <span className="token-trades-mobile__mcap financial-value">
                            {formatArenaQuoteUsd(mcapUsd)} MC
                          </span>
                        </span>
                      </span>
                    </button>
                    <a
                      href={explorerTxUrl(trade.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="token-trades-mobile__aside"
                      aria-label={`View transaction, ${formatAge(trade.blockTime, ageNowMs)} ago`}
                    >
                      <span className="token-trades-mobile__time financial-value">
                        {formatAge(trade.blockTime, ageNowMs)}
                      </span>
                      <PumpIcon icon={faExternalLink} size="sm" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
            <div ref={tradeSentinelRef}>
              <LoadMoreSentinel loading={loadingMoreTrades} label="Loading trades…" />
            </div>
          </div>
        ) : (
          <div className={activityTableScrollClass}>
            <table className="token-tape-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="token-tape-table__col-num">Price</th>
                  <th className="token-tape-table__col-num">Value</th>
                  <th className="token-tape-table__col-num">{symbol}</th>
                  <th className="token-tape-table__col-end">Age</th>
                  <th className="token-tape-table__col-end">Txn</th>
                </tr>
              </thead>
              <tbody>
                {displayedTrades.map((trade) => {
                  const isBuy = trade.side === "BUY";
                  const isOptimistic = trade.id.startsWith("optimistic:");
                  const tradeNetUsd = tradeNetUsdForDisplay(trade, bnbUsd);
                  const sideTone = isBuy
                    ? "token-tape-table__amount--buy"
                    : "token-tape-table__amount--sell";
                  return (
                    <tr
                      key={trade.id}
                      className={tradeRowClass(trade.id, trade.side, isOptimistic)}
                    >
                      <td className="token-tape-table__account">
                        <IdentityPill
                          address={trade.traderAddress}
                          displayUsername={
                            trade.traderDisplayUsername ??
                            displayNameLookup.get(trade.traderAddress.toLowerCase())?.label
                          }
                          hasStatusBadge={
                            displayNameLookup.get(trade.traderAddress.toLowerCase())
                              ?.hasStatusBadge
                          }
                          showCreatorBadge={trade.traderAddress.toLowerCase() === creatorKey}
                          onAddressClick={onAddressClick}
                        />
                      </td>
                      <td className="token-tape-table__type">
                        <TradeSideMark side={trade.side} />
                      </td>
                      <td className="token-tape-table__col-num token-tape-table__value financial-value token-tape-table__muted token-tape-table__cell-default">
                        <PumpSubscriptPrice
                          value={tradeFillPriceUsd(
                            trade.nativeAmount,
                            trade.tokenAmount,
                            bnbUsd,
                            trade.feeBnb,
                            trade.netBnb,
                            trade.priceBnb,
                            trade.nativeUsdRate
                          )}
                        />
                      </td>
                      <td
                        className={`token-tape-table__col-num token-tape-table__value financial-value font-medium ${sideTone}`}
                      >
                        {formatUsdReadable(tradeNetUsd)}
                      </td>
                      <td
                        className={`token-tape-table__col-num token-tape-table__value financial-value ${sideTone}`}
                      >
                        {formatTokenAmount(Number(trade.tokenAmount))}
                      </td>
                      <td className="token-tape-table__col-end token-tape-table__muted financial-value">
                        {formatAge(trade.blockTime, ageNowMs)}
                      </td>
                      <td className="token-tape-table__col-end token-tape-table__txn-cell">
                        <a
                          href={explorerTxUrl(trade.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="token-tape-txn-row financial-value"
                          aria-label={`View transaction ${shortAddress(trade.txHash, true)} on explorer`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="token-tape-txn-row__hash">
                            {shortAddress(trade.txHash, true)}
                          </span>
                          <span className="token-tape-txn-link" aria-hidden>
                            <PumpIcon icon={faExternalLink} className="h-3.5 w-3.5" />
                          </span>
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div ref={tradeSentinelRef}>
              <LoadMoreSentinel loading={loadingMoreTrades} label="Loading trades…" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

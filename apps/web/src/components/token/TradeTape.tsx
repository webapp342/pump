"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TokenHolderSnapshot, TradeItem } from "@/lib/db/launchpad";
import { explorerTxUrl, shortAddress } from "@/config/chain";
import { PumpIcon, faCrown, faExternalLink } from "@/lib/icons";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { PctChange } from "@/components/ui/PctChange";
import { ACTIVITY_PAGE_SIZE } from "@/lib/activity-page-size";
import { PumpSubscriptPrice } from "@/components/ui/PumpSubscriptPrice";
import {
  DEFAULT_TOKEN_TOTAL_SUPPLY,
  formatUsdReadable,
  formatTradeAmountUsdFixed2,
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

type ActivityTab = "holders" | "trades" | "social" | "about";

export type TradeTapeTab = ActivityTab;

type HolderRow = {
  address: string;
  displayUsername?: string;
  netTokens: number;
  remainingCostBasisBnb: number;
  remainingCostBasisUsd: number;
  avgEntryBnb: number | null;
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
  { id: "social", label: "Social" },
  { id: "about", label: "About" },
];

function formatTradeClockTime(iso: string, mobile = false): string {
  return new Date(iso).toLocaleTimeString(
    undefined,
    mobile
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }
  );
}

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

function formatTokenAmountMobile(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(1);
  if (value > 0) return value.toFixed(2);
  return "0";
}

function formatSupplyShareMobile(balance: number): string {
  const pct = (balance / DEFAULT_TOKEN_TOTAL_SUPPLY) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
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
    byAddress.set(row.address.toLowerCase(), row);
  }
  for (const row of incoming) {
    byAddress.set(row.address.toLowerCase(), row);
  }
  return [...byAddress.values()].sort((a, b) => b.netTokens - a.netTokens);
}

function CreatorBadge({ iconOnly = false }: { iconOnly?: boolean }) {
  if (iconOnly) {
    return (
      <span
        className="token-tape-creator-icon inline-flex shrink-0 items-center justify-center text-pump-accent"
        title="Creator"
        aria-label="Creator"
      >
        <PumpIcon icon={faCrown} className="token-tape-creator-icon__glyph" aria-hidden />
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-full bg-pump-accent/15 px-1.5 py-px text-label font-semibold uppercase tracking-wide text-pump-accent ring-1 ring-inset ring-pump-accent/30">
      Creator
    </span>
  );
}

function IdentityPill({
  address,
  displayUsername,
  showCreatorBadge = false,
  onAddressClick,
  compact = false,
}: {
  address: string;
  displayUsername?: string;
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
      aria-label={`View profile ${label}${showCreatorBadge ? ", creator" : ""}`}
    >
      <UserAvatarForAddress
        address={address}
        size={compact ? 16 : 18}
        className="shrink-0"
      />
      <span className="token-tape-identity__label">{label}</span>
      {showCreatorBadge ? <CreatorBadge iconOnly={compact} /> : null}
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
  headTrades,
  wsConnected = false,
  holdersRefreshKey = 0,
  initialHolders,
  currentPriceBnb,
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
}: {
  tokenAddress: string;
  creatorAddress: string;
  symbol: string;
  /** Latest trades from live poll + optimistic layer (tape head). */
  headTrades: TradeItem[];
  wsConnected?: boolean;
  holdersRefreshKey?: number;
  initialHolders?: TokenHolderSnapshot[];
  currentPriceBnb: number;
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
    async (offset: number, append: boolean) => {
      const response = await fetch(
        `/api/tokens/${tokenAddress}/holders?limit=${ACTIVITY_PAGE_SIZE}&offset=${offset}`,
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
    if (tab !== "holders" || !wsConnected) return;
    const timer = window.setInterval(() => {
      void fetchHoldersPage(0, false);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [fetchHoldersPage, tab, tokenAddress, wsConnected]);

  useEffect(() => {
    if (holdersRefreshKey <= 0) return;
    void fetchHoldersPage(0, false);
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
          <div className="token-tape-social-panel" aria-label="Social" />
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
            <section className="token-tape-about-description">
              <p className="section-label">Description</p>
              <p className="token-tape-about-description__copy">
                {tokenDescription?.trim() || "No description provided."}
              </p>
            </section>
          </div>
        ) : tab === "holders" ? (
          !holdersReady ? (
            <p className="token-tape-empty">Verifying holders on-chain…</p>
          ) : holderRows.length === 0 ? (
            <p className="token-tape-empty">No holders yet.</p>
          ) : (
            <div
              className={
                mobileStickyHead
                  ? `${activityTableScrollClass} token-tape-table-wrap--mobile-holders`
                  : activityTableScrollClass
              }
            >
              <table
                className={
                  mobileStickyHead
                    ? "token-tape-table token-tape-table--mobile-holders"
                    : "token-tape-table"
                }
              >
                {mobileStickyHead ? (
                  <colgroup>
                    <col className="token-tape-table__col-h-account" />
                    <col className="token-tape-table__col-h-balance" />
                    <col className="token-tape-table__col-h-supply" />
                    <col className="token-tape-table__col-h-pnl" />
                  </colgroup>
                ) : null}
                <thead>
                  <tr>
                    {mobileStickyHead ? (
                      <>
                        <th className="token-tape-table__head-h-account">Account</th>
                        <th className="token-tape-table__head-h-balance">Balance</th>
                        <th className="token-tape-table__head-h-supply">Supply</th>
                        <th className="token-tape-table__head-h-pnl">P/L</th>
                      </>
                    ) : (
                      <>
                        <th>Account</th>
                        <th className="token-tape-table__col-num">Balance</th>
                        <th className="token-tape-table__col-num">Supply</th>
                        <th className="token-tape-table__col-num">Entry</th>
                        <th className="token-tape-table__col-end">P/L</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {holderRows.map((row) => {
                    const { avgEntryUsd, unrealizedPnlUsd, unrealizedPnlPct, pnlTone } =
                      computeHolderMetrics(row, currentPriceBnb, bnbUsd);

                    if (mobileStickyHead) {
                      return (
                        <tr key={row.address}>
                          <td className="token-tape-table__account">
                            <IdentityPill
                              address={row.address}
                              displayUsername={
                                row.displayUsername ??
                                displayNameLookup.get(row.address.toLowerCase())
                              }
                              showCreatorBadge={row.address.toLowerCase() === creatorKey}
                              onAddressClick={onAddressClick}
                              compact
                            />
                          </td>
                          <td className="token-tape-table__cell-h-balance token-tape-table__value financial-value token-tape-table__cell-default">
                            {formatTokenAmountMobile(row.netTokens)}
                          </td>
                          <td className="token-tape-table__cell-h-supply token-tape-table__value financial-value token-tape-table__muted">
                            {formatSupplyShareMobile(row.netTokens)}
                          </td>
                          <td className="token-tape-table__cell-h-pnl">
                            <span
                              className={`financial-value font-medium ${pnlTone}`}
                            >
                              {formatUsdReadable(unrealizedPnlUsd, {
                                compact: true,
                                signed: true,
                                twoDecimalsUnder: 10_000,
                              })}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={row.address}>
                        <td className="token-tape-table__account">
                          <IdentityPill
                            address={row.address}
                            displayUsername={
                              row.displayUsername ??
                              displayNameLookup.get(row.address.toLowerCase())
                            }
                            showCreatorBadge={row.address.toLowerCase() === creatorKey}
                            onAddressClick={onAddressClick}
                          />
                        </td>
                        <td className="token-tape-table__col-num token-tape-table__value financial-value token-tape-table__cell-default">
                          {formatTokenAmount(row.netTokens)}
                        </td>
                        <td className="token-tape-table__col-num token-tape-table__value financial-value token-tape-table__muted">
                          {formatSupplyShare(row.netTokens)}
                        </td>
                        <td className="token-tape-table__col-num token-tape-table__value financial-value token-tape-table__muted">
                          {formatUsdReadable(avgEntryUsd, { compact: true })}
                        </td>
                        <td className="token-tape-table__col-end">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <span className={`financial-value font-medium ${pnlTone}`}>
                              {formatUsdReadable(unrealizedPnlUsd, {
                                compact: true,
                                signed: true,
                              })}
                            </span>
                            <PctChange
                              value={unrealizedPnlPct}
                              className="text-caption"
                              toneClassName={pnlTone}
                            />
                          </div>
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
          <div className={`${activityTableScrollClass} token-tape-table-wrap--mobile-trades`}>
            <table className="token-tape-table token-tape-table--mobile-trades">
              <colgroup>
                <col className="token-tape-table__col-amount" />
                <col className="token-tape-table__col-account" />
                <col className="token-tape-table__col-price" />
                <col className="token-tape-table__col-time" />
              </colgroup>
              <thead>
                <tr>
                  <th className="token-tape-table__head-amount">Value</th>
                  <th className="token-tape-table__head-account">Account</th>
                  <th className="token-tape-table__head-price">Price</th>
                  <th className="token-tape-table__head-time">Time</th>
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
                      <td
                        className={`token-tape-table__cell-amount token-tape-table__value financial-value font-medium ${sideTone}`}
                      >
                        {formatTradeAmountUsdFixed2(tradeNetUsd)}
                      </td>
                      <td className="token-tape-table__account">
                        <IdentityPill
                          address={trade.traderAddress}
                          displayUsername={
                            trade.traderDisplayUsername ??
                            displayNameLookup.get(trade.traderAddress.toLowerCase())
                          }
                          showCreatorBadge={
                            trade.traderAddress.toLowerCase() === creatorKey
                          }
                          onAddressClick={onAddressClick}
                          compact
                        />
                      </td>
                      <td className="token-tape-table__value financial-value token-tape-table__cell-default token-tape-table__cell-price">
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
                      <td className="token-tape-table__time-cell">
                        <div className="token-tape-time-txn">
                          <span className="token-tape-time-txn__clock financial-value">
                            {formatTradeClockTime(trade.blockTime, true)}
                          </span>
                          <a
                            href={explorerTxUrl(trade.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="token-tape-txn-link"
                            aria-label="View transaction on explorer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <PumpIcon icon={faExternalLink} className="h-3.5 w-3.5" />
                          </a>
                        </div>
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
                  <th className="token-tape-table__col-end">Time</th>
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
                            displayNameLookup.get(trade.traderAddress.toLowerCase())
                          }
                          showCreatorBadge={trade.traderAddress.toLowerCase() === creatorKey}
                          onAddressClick={onAddressClick}
                        />
                      </td>
                      <td className={`token-tape-table__type font-medium ${sideTone}`}>
                        {isBuy ? "Buy" : "Sell"}
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
                      <td className="token-tape-table__col-end token-tape-table__muted">
                        {formatTradeClockTime(trade.blockTime)}
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

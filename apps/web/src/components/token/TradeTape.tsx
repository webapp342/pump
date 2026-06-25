"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TokenHolderSnapshot, TradeItem } from "@/lib/db/launchpad";
import { explorerTxUrl, shortAddress } from "@/config/chain";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { SectionHeadingIcon } from "@/components/ui/IconLabel";
import { PctChange } from "@/components/ui/PctChange";
import { MetricIcons } from "@/lib/metric-icons";
import { ACTIVITY_PAGE_SIZE } from "@/lib/activity-page-size";
import { DEFAULT_TOKEN_TOTAL_SUPPLY, formatUsdReadable, formatTradeFillPriceUsd, tradeNetUsdForDisplay, tradeNetBnbFromParts } from "@/lib/format-usd";
import {
  resolveVerifiedTokenBalance,
  scaleCostBasisForBalance,
} from "@/lib/onchain-balance";
import { useLiveTradeAnimations } from "@/hooks/useLiveTradeAnimations";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";

type ActivityTab = "holders" | "trades";

type HolderRow = {
  address: string;
  netTokens: number;
  remainingCostBasisBnb: number;
  avgEntryBnb: number | null;
};

type PagedMeta = {
  hasMore: boolean;
  offset: number;
};

const activityTableScrollClass =
  "min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]";
const cellClass = "px-2.5 py-2.5 sm:px-3 lg:px-4 lg:py-3";
const accountCellClass = `${cellClass} max-w-[9.5rem] whitespace-nowrap !pr-0 lg:min-w-[9rem] lg:max-w-none lg:!pr-4`;
const sideCellClass = `${cellClass} w-px whitespace-nowrap !px-1 !pl-0 lg:!px-3 lg:!pl-4`;
const amountCellClass = `${cellClass} whitespace-nowrap !pl-1 financial-value text-pump-text lg:!pl-3`;

function tradeNetBnb(trade: TradeItem): number {
  return tradeNetBnbFromParts(trade.nativeAmount, trade.feeBnb, trade.netBnb);
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
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
    .map((holder) => {
      const indexedBalance = Number(holder.tokenBalance);
      const onChainBalance =
        holder.onChainBalance != null ? Number(holder.onChainBalance) : undefined;
      const { displayBalance, hidden } = resolveVerifiedTokenBalance(
        indexedBalance,
        onChainBalance
      );
      if (hidden) return null;

      const fullCostBasis = Math.max(0, Number(holder.remainingCostBasisBnb));
      const remainingCostBasisBnb = scaleCostBasisForBalance(
        fullCostBasis,
        indexedBalance,
        displayBalance
      );

      return {
        address: holder.address,
        netTokens: displayBalance,
        remainingCostBasisBnb,
        avgEntryBnb:
          displayBalance > 0 ? remainingCostBasisBnb / displayBalance : null,
      };
    })
    .filter((row): row is HolderRow => row != null)
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

function CreatorBadge() {
  return (
    <span className="shrink-0 rounded-full bg-pump-accent/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-pump-accent">
      Creator
    </span>
  );
}

function IdentityPill({
  address,
  showCreatorBadge = false,
  onAddressClick,
}: {
  address: string;
  showCreatorBadge?: boolean;
  onAddressClick: (address: string) => void;
}) {
  const label = shortAddress(address, true);
  return (
    <button
      type="button"
      onClick={() => onAddressClick(address)}
      className="inline-flex min-w-0 max-w-full items-center gap-1 text-left text-caption text-pump-text transition hover:text-pump-accent"
      aria-label={`View profile ${label}`}
    >
      <UserAvatarForAddress address={address} size={22} className="shrink-0 sm:!h-6 sm:!w-6" />
      <span className="truncate font-medium">{label}</span>
      {showCreatorBadge ? <CreatorBadge /> : null}
    </button>
  );
}

function TradeSideLabel({ isBuy }: { isBuy: boolean }) {
  return (
    <span className={`text-caption font-medium ${isBuy ? "text-pump-success" : "text-pump-danger"}`}>
      {isBuy ? "Buy" : "Sell"}
    </span>
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
}) {
  const creatorKey = creatorAddress.toLowerCase();
  const [tab, setTab] = useState<ActivityTab>("trades");

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

  return (
    <section className="space-y-3">
      <SectionHeadingIcon icon={MetricIcons.activity}>Activity</SectionHeadingIcon>

      <div className="panel-surface overflow-hidden">
        <div className="border-b border-pump-border/15 px-3 py-2.5">
          <div className="segment-control w-fit" role="tablist" aria-label="Activity">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "trades"}
              onClick={() => setTab("trades")}
              className={tab === "trades" ? "chip-button chip-button-active" : "chip-button"}
            >
              Trades
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "holders"}
              onClick={() => setTab("holders")}
              className={tab === "holders" ? "chip-button chip-button-active" : "chip-button"}
            >
              Holders
            </button>
          </div>
        </div>

        {tab === "holders" ? (
          !holdersReady ? (
            <p className="px-4 py-6 text-body-sm text-pump-muted">Verifying holders on-chain…</p>
          ) : holderRows.length === 0 ? (
            <p className="px-4 py-6 text-body-sm text-pump-muted">No holders yet.</p>
          ) : (
            <div className={activityTableScrollClass}>
              <table className="sheet-grid w-max min-w-[640px] lg:w-full lg:min-w-[720px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">Account</th>
                    <th>Balance</th>
                    <th>Supply</th>
                    <th>Entry</th>
                    <th className="text-right">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {holderRows.map((row) => {
                    const avgEntryUsd =
                      row.avgEntryBnb != null && bnbUsd != null ? row.avgEntryBnb * bnbUsd : null;
                    const currentValueUsd =
                      bnbUsd != null ? currentPriceBnb * row.netTokens * bnbUsd : null;
                    const costBasisUsd =
                      bnbUsd != null ? row.remainingCostBasisBnb * bnbUsd : null;
                    const unrealizedPnlUsd =
                      currentValueUsd != null && costBasisUsd != null
                        ? currentValueUsd - costBasisUsd
                        : null;
                    const unrealizedPnlPct =
                      costBasisUsd != null && costBasisUsd > 0
                        ? ((currentValueUsd ?? 0) - costBasisUsd) / costBasisUsd * 100
                        : null;
                    const pnlTone =
                      unrealizedPnlUsd == null
                        ? "text-pump-muted"
                        : unrealizedPnlUsd >= 0
                          ? "text-pump-success"
                          : "text-pump-danger";

                    return (
                      <tr key={row.address}>
                        <td className={accountCellClass}>
                          <IdentityPill
                            address={row.address}
                            showCreatorBadge={row.address.toLowerCase() === creatorKey}
                            onAddressClick={onAddressClick}
                          />
                        </td>
                        <td className={`${cellClass} financial-value text-pump-text`}>
                          {formatTokenAmount(row.netTokens)}
                        </td>
                        <td className={`${cellClass} financial-value text-pump-text`}>
                          {formatSupplyShare(row.netTokens)}
                        </td>
                        <td className={`${cellClass} financial-value text-pump-text`}>
                          {formatUsdReadable(avgEntryUsd, { compact: true })}
                        </td>
                        <td className={cellClass}>
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap lg:gap-2">
                            <span className={`financial-value text-caption font-semibold lg:text-body-sm ${pnlTone}`}>
                              {formatUsdReadable(unrealizedPnlUsd, { compact: true, signed: true })}
                            </span>
                            <PctChange
                              value={unrealizedPnlPct}
                              className="text-[11px] lg:text-caption"
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
          <p className="px-4 py-6 text-body-sm text-pump-muted">No trades yet.</p>
        ) : (
          <div className={activityTableScrollClass}>
            <table className="sheet-grid w-max min-w-[680px] lg:w-full lg:min-w-[860px]">
              <thead>
                <tr>
                  <th className="whitespace-nowrap !pr-0 lg:!pr-3">Account</th>
                  <th className={`${sideCellClass} !py-2.5 font-semibold`}>Side</th>
                  <th className="!pl-1 lg:!pl-3">Amount</th>
                  <th>${symbol}</th>
                  <th>Price</th>
                  <th>Time</th>
                  <th className="text-right">Txn</th>
                </tr>
              </thead>
              <tbody>
                {displayedTrades.map((trade) => {
                  const isBuy = trade.side === "BUY";
                  const isOptimistic = trade.id.startsWith("optimistic:");
                  const tradeNetUsd = tradeNetUsdForDisplay(trade, bnbUsd);
                  return (
                    <tr
                      key={trade.id}
                      className={tradeRowClass(trade.id, trade.side, isOptimistic)}
                    >
                      <td className={accountCellClass}>
                        <IdentityPill
                          address={trade.traderAddress}
                          showCreatorBadge={trade.traderAddress.toLowerCase() === creatorKey}
                          onAddressClick={onAddressClick}
                        />
                      </td>
                      <td className={sideCellClass}>
                        <TradeSideLabel isBuy={isBuy} />
                      </td>
                      <td className={amountCellClass}>
                        {formatUsdReadable(tradeNetUsd)}
                      </td>
                      <td className={`${cellClass} financial-value text-pump-text`}>
                        {formatTokenAmount(Number(trade.tokenAmount))}
                      </td>
                      <td className={`${cellClass} financial-value text-pump-text`}>
                        {formatTradeFillPriceUsd(
                          trade.nativeAmount,
                          trade.tokenAmount,
                          bnbUsd,
                          trade.feeBnb,
                          trade.netBnb,
                          trade.priceBnb,
                          trade.nativeUsdRate
                        )}
                      </td>
                      <td className={`${cellClass} text-caption text-pump-muted whitespace-nowrap`}>
                        {formatRelativeTime(trade.blockTime)}
                      </td>
                      <td className={`${cellClass} text-right`}>
                        <a
                          href={explorerTxUrl(trade.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="financial-value text-caption text-pump-muted hover:text-pump-accent"
                        >
                          {shortAddress(trade.txHash, true)}
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

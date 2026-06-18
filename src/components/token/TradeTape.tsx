"use client";

import { useEffect, useMemo, useState } from "react";
import type { TokenHolderSnapshot, TradeItem } from "@/lib/db/launchpad";
import { explorerTxUrl, shortAddress } from "@/config/chain";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { SectionHeadingIcon } from "@/components/ui/IconLabel";
import { PctChange } from "@/components/ui/PctChange";
import { MetricIcons } from "@/lib/metric-icons";
import { DEFAULT_TOKEN_TOTAL_SUPPLY, bnbToUsd, formatUsdReadable, formatTradeFillPriceUsd, tradeNetBnbFromParts } from "@/lib/format-usd";
import {
  resolveVerifiedTokenBalance,
  scaleCostBasisForBalance,
} from "@/lib/onchain-balance";
import { useLiveTradeAnimations } from "@/hooks/useLiveTradeAnimations";

type ActivityTab = "holders" | "trades";

type HolderRow = {
  address: string;
  netTokens: number;
  remainingCostBasisBnb: number;
  avgEntryBnb: number | null;
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

export function TradeTape({
  tokenAddress,
  creatorAddress,
  symbol,
  trades,
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
  trades: TradeItem[];
  wsConnected?: boolean;
  holdersRefreshKey?: number;
  initialHolders?: TokenHolderSnapshot[];
  currentPriceBnb: number;
  bnbUsd: number | null;
  onAddressClick: (address: string) => void;
}) {
  const creatorKey = creatorAddress.toLowerCase();
  const [tab, setTab] = useState<ActivityTab>("trades");
  const [holderRows, setHolderRows] = useState<HolderRow[]>(() =>
    initialHolders?.length ? mapApiHoldersToRows(initialHolders) : []
  );
  const [holdersReady, setHoldersReady] = useState(
    Boolean(initialHolders && initialHolders.length > 0)
  );

  const tradeIds = useMemo(() => trades.map((t) => t.id), [trades]);
  const { rowClass: tradeRowClass } = useLiveTradeAnimations(tradeIds);

  useEffect(() => {
    if (initialHolders?.length) {
      setHolderRows(mapApiHoldersToRows(initialHolders));
      setHoldersReady(true);
    }
  }, [initialHolders]);

  useEffect(() => {
    let cancelled = false;

    async function loadHolders(isInitial: boolean) {
      try {
        const response = await fetch(`/api/tokens/${tokenAddress}/holders`, {
          cache: "no-store",
        });
        const body = (await response.json()) as { data?: TokenHolderSnapshot[] };
        if (!response.ok || cancelled) return;
        setHolderRows(mapApiHoldersToRows(body.data ?? []));
        setHoldersReady(true);
      } catch {
        if (cancelled) return;
        if (isInitial) {
          setHolderRows([]);
          setHoldersReady(true);
        }
      }
    }

    void loadHolders(!initialHolders?.length);
    if (wsConnected) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(() => void loadHolders(false), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tokenAddress, wsConnected, initialHolders?.length]);

  useEffect(() => {
    if (holdersRefreshKey <= 0) return;
    let cancelled = false;

    async function refreshHolders() {
      try {
        const response = await fetch(`/api/tokens/${tokenAddress}/holders`, {
          cache: "no-store",
        });
        const body = (await response.json()) as { data?: TokenHolderSnapshot[] };
        if (!response.ok || cancelled) return;
        setHolderRows(mapApiHoldersToRows(body.data ?? []));
        setHoldersReady(true);
      } catch {
        // Keep last snapshot.
      }
    }

    void refreshHolders();
    return () => {
      cancelled = true;
    };
  }, [holdersRefreshKey, tokenAddress]);

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
            </div>
          )
        ) : trades.length === 0 ? (
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
                {trades.map((trade) => {
                  const isBuy = trade.side === "BUY";
                  const isOptimistic = trade.id.startsWith("optimistic:");
                  const tradeNetUsd = bnbToUsd(tradeNetBnb(trade), bnbUsd);
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
                          trade.priceBnb
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
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { TokenHolderSnapshot, TradeItem } from "@/lib/db/launchpad";
import { explorerTxUrl, shortAddress } from "@/config/chain";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { DEFAULT_TOKEN_TOTAL_SUPPLY, bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import {
  ON_CHAIN_BALANCE_EPSILON,
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

const HOLDER_BALANCE_EPSILON = ON_CHAIN_BALANCE_EPSILON;

function tradeNetBnb(trade: TradeItem): number {
  if (trade.netBnb != null) return Number(trade.netBnb);
  const fee = Number(trade.feeBnb ?? 0);
  return Math.max(0, Number(trade.nativeAmount) - fee);
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

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
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

      const fullCostBasis = Math.max(
        0,
        Number(holder.totalBoughtBnb) - Number(holder.totalSoldBnb)
      );
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
    <span className="shrink-0 rounded-full bg-pump-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pump-accent">
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
  const label = shortAddress(address);
  return (
    <button
      type="button"
      onClick={() => onAddressClick(address)}
      className="inline-flex min-w-0 items-center gap-2 text-left text-pump-text transition hover:text-pump-accent"
      aria-label={`View profile ${label}`}
    >
      <UserAvatarForAddress address={address} size={32} />
      <span className="truncate font-medium">{label}</span>
      {showCreatorBadge ? <CreatorBadge /> : null}
    </button>
  );
}

export function TradeTape({
  tokenAddress,
  creatorAddress,
  trades,
  wsConnected = false,
  currentPriceBnb,
  bnbUsd,
  onAddressClick,
}: {
  tokenAddress: string;
  creatorAddress: string;
  trades: TradeItem[];
  wsConnected?: boolean;
  currentPriceBnb: number;
  bnbUsd: number | null;
  onAddressClick: (address: string) => void;
}) {
  const creatorKey = creatorAddress.toLowerCase();
  const [tab, setTab] = useState<ActivityTab>("trades");
  const [holderRows, setHolderRows] = useState<HolderRow[]>([]);
  const [holdersReady, setHoldersReady] = useState(false);

  const tradeIds = useMemo(() => trades.map((t) => t.id), [trades]);
  const { rowClass: tradeRowClass, isLanding } = useLiveTradeAnimations(tradeIds);

  useEffect(() => {
    let cancelled = false;
    setHoldersReady(false);
    setHolderRows([]);

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

    void loadHolders(true);
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
  }, [tokenAddress, wsConnected]);

  return (
    <section className="space-y-3">
      <h2 className="section-heading">Activity</h2>

      <div className="rounded-lg border border-pump-border/15 bg-transparent">
        <div className="flex flex-wrap items-center gap-2 border-b border-pump-border/15 p-3">
          <button
            type="button"
            onClick={() => setTab("trades")}
            className={tab === "trades" ? "chip-button chip-button-active" : "chip-button"}
          >
            Trades
          </button>
          <button
            type="button"
            onClick={() => setTab("holders")}
            className={tab === "holders" ? "chip-button chip-button-active" : "chip-button"}
          >
            Holders
          </button>
        </div>

      {tab === "holders" ? (
          !holdersReady ? (
            <p className="px-4 py-6 text-body-sm text-pump-muted">Verifying holders on-chain…</p>
          ) : holderRows.length === 0 ? (
            <p className="px-4 py-6 text-body-sm text-pump-muted">No holders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="sheet-grid min-w-[720px]">
                <thead>
                  <tr>
                    <th>Account</th>
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
                      <tr key={row.address} className="border-b border-pump-border/10 last:border-b-0">
                        <td className="px-4 py-3">
                          <IdentityPill
                            address={row.address}
                            showCreatorBadge={row.address.toLowerCase() === creatorKey}
                            onAddressClick={onAddressClick}
                          />
                        </td>
                        <td className="px-4 py-3 financial-value text-pump-text">
                          {formatTokenAmount(row.netTokens)}
                        </td>
                        <td className="px-4 py-3 financial-value text-pump-text">
                          {formatSupplyShare(row.netTokens)}
                        </td>
                        <td className="px-4 py-3 financial-value text-pump-text">
                          {formatUsdReadable(avgEntryUsd)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            <span className={`financial-value text-body-sm font-semibold ${pnlTone}`}>
                              {formatUsdReadable(unrealizedPnlUsd)}
                            </span>
                            <span className={`financial-value text-caption ${pnlTone}`}>
                              {formatPercent(unrealizedPnlPct)}
                            </span>
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
            <div className="overflow-x-auto">
              <table className="sheet-grid min-w-[860px]">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Side</th>
                    <th>Amount</th>
                    <th>Tokens</th>
                    <th>Price</th>
                    <th>Time</th>
                    <th className="text-right">Txn</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => {
                    const isBuy = trade.side === "BUY";
                    const isOptimistic = trade.id.startsWith("optimistic:");
                    const tradePriceUsd =
                      bnbUsd != null ? Number(trade.priceBnb) * bnbUsd : null;
                    const tradeNetUsd = bnbToUsd(tradeNetBnb(trade), bnbUsd);
                    return (
                      <tr
                        key={trade.id}
                        className={`border-b border-pump-border/10 last:border-b-0 ${tradeRowClass(
                          trade.id,
                          trade.side,
                          isOptimistic
                        )}`}
                      >
                        <td className="px-4 py-3">
                          <IdentityPill
                            address={trade.traderAddress}
                            showCreatorBadge={trade.traderAddress.toLowerCase() === creatorKey}
                            onAddressClick={onAddressClick}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-caption font-medium ${isBuy ? "text-pump-success" : "text-pump-danger"}`}
                          >
                            {isBuy ? "Buy" : "Sell"}
                          </span>
                          {isOptimistic ? (
                            <span className="ml-2 text-caption text-pump-accent">Live</span>
                          ) : isLanding(trade.id) ? (
                            <span className="ml-2 text-caption text-pump-muted">New</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 financial-value text-pump-text">
                          {formatUsdReadable(tradeNetUsd)}
                        </td>
                        <td className="px-4 py-3 financial-value text-pump-text">
                          {formatTokenAmount(Number(trade.tokenAmount))}
                        </td>
                        <td className="px-4 py-3 financial-value text-pump-text">
                          {formatUsdReadable(tradePriceUsd)}
                        </td>
                        <td className="px-4 py-3 text-caption text-pump-muted">
                          {formatRelativeTime(trade.blockTime)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={explorerTxUrl(trade.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="financial-value text-pump-muted hover:text-pump-accent"
                          >
                            {shortAddress(trade.txHash)}
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

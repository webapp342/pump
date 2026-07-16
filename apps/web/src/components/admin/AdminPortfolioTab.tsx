"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SellAllHoldingsModal,
  type SellAllHoldingInput,
} from "@/components/portfolio/SellAllHoldingsModal";
import {
  AdminAlert,
  AdminBlock,
  AdminBtn,
  AdminEmpty,
  AdminGridTable,
  AdminTextButton,
} from "@/components/admin/AdminChrome";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { explorerAddressUrl, shortAddress } from "@/config/chain";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd, formatPortfolioHoldingValueUsd } from "@/lib/format-usd";
import { resolveVerifiedTokenBalance } from "@/lib/onchain-balance";
import {
  PORTFOLIO_CREATOR_WALLET_SCAN_MAX,
  PORTFOLIO_ONCHAIN_BALANCE_CHUNK,
} from "@/lib/portfolio-limits";

type PortfolioPosition = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenBalance: string;
  lastPriceBnb: string;
};

type PortfolioData = {
  address: string;
  positions: PortfolioPosition[];
};

type WalletLaunchpadHolding = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenBalance: string;
  lastPriceBnb: string;
};

type HoldingRow = SellAllHoldingInput & {
  balance: number;
  estimatedValueBnb: number;
};

function formatTokenBalance(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

async function fetchPortfolioData(walletAddress: string): Promise<PortfolioData | null> {
  const response = await fetch(
    `/api/portfolio?address=${encodeURIComponent(walletAddress)}&createdLimit=1`,
    { cache: "no-store" }
  );
  const body = (await response.json()) as { data?: PortfolioData; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Failed to load portfolio");
  return body.data ?? null;
}

async function fetchOnChainBalancesForTokens(
  walletAddress: string,
  tokenAddresses: string[]
): Promise<Record<string, string>> {
  if (tokenAddresses.length === 0) return {};

  const merged: Record<string, string> = {};

  for (let i = 0; i < tokenAddresses.length; i += PORTFOLIO_ONCHAIN_BALANCE_CHUNK) {
    const chunk = tokenAddresses.slice(i, i + PORTFOLIO_ONCHAIN_BALANCE_CHUNK);
    try {
      const response = await fetch("/api/portfolio/onchain-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, tokens: chunk }),
        cache: "no-store",
      });
      if (!response.ok) continue;
      const body = (await response.json()) as { data?: Record<string, string> };
      Object.assign(merged, body.data ?? {});
    } catch {
      // Keep partial results when a batch fails.
    }
  }

  return merged;
}

async function fetchExtraWalletHoldings(
  walletAddress: string,
  excludeTokenAddresses: string[]
): Promise<WalletLaunchpadHolding[]> {
  const excludeQuery =
    excludeTokenAddresses.length > 0 ? `&exclude=${excludeTokenAddresses.join(",")}` : "";
  const scanQuery = `&scanLimit=${PORTFOLIO_CREATOR_WALLET_SCAN_MAX}`;
  const response = await fetch(
    `/api/portfolio/wallet-holdings?address=${encodeURIComponent(walletAddress)}&scope=creator${excludeQuery}${scanQuery}`,
    { cache: "no-store" }
  );
  if (!response.ok) return [];

  const body = (await response.json()) as { data?: WalletLaunchpadHolding[] };
  return body.data ?? [];
}

async function loadAdminHoldings(walletAddress: string): Promise<HoldingRow[]> {
  const portfolio = await fetchPortfolioData(walletAddress);
  if (!portfolio) return [];

  const excludeAddresses = portfolio.positions.map((position) => position.tokenAddress);
  const [onChainBalances, walletHoldings] = await Promise.all([
    fetchOnChainBalancesForTokens(
      walletAddress,
      portfolio.positions.map((position) => position.tokenAddress)
    ),
    fetchExtraWalletHoldings(walletAddress, excludeAddresses),
  ]);

  const rows: HoldingRow[] = [];

  for (const position of portfolio.positions) {
    const onChainStr = onChainBalances[position.tokenAddress.toLowerCase()];
    const onChainBalance = onChainStr != null ? Number(onChainStr) : null;
    const { displayBalance, hidden } = resolveVerifiedTokenBalance(
      Number(position.tokenBalance),
      onChainBalance
    );
    if (hidden || displayBalance <= 0) continue;

    rows.push({
      tokenAddress: position.tokenAddress,
      symbol: position.symbol,
      name: position.name,
      logoUrl: position.logoUrl,
      balance: displayBalance,
      estimatedValueBnb: displayBalance * Number(position.lastPriceBnb),
    });
  }

  for (const holding of walletHoldings) {
    const balance = Number(holding.tokenBalance);
    if (balance <= 0) continue;

    rows.push({
      tokenAddress: holding.tokenAddress,
      symbol: holding.symbol,
      name: holding.name,
      logoUrl: holding.logoUrl,
      balance,
      estimatedValueBnb: balance * Number(holding.lastPriceBnb),
    });
  }

  return rows.sort((a, b) => b.estimatedValueBnb - a.estimatedValueBnb);
}

export function AdminPortfolioTab({ address }: { address: string }) {
  const { bnbUsd } = useBnbUsdPrice();
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sellAllOpen, setSellAllOpen] = useState(false);
  const [sellMaxTarget, setSellMaxTarget] = useState<SellAllHoldingInput | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadAdminHoldings(address);
      setRows(next);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Could not load portfolio.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  const sellAllInput = useMemo(
    () =>
      rows.map(({ tokenAddress, symbol, name, logoUrl }) => ({
        tokenAddress,
        symbol,
        name,
        logoUrl,
      })),
    [rows]
  );

  const totalValueUsd = useMemo(
    () => rows.reduce((sum, row) => sum + (bnbToUsd(row.estimatedValueBnb, bnbUsd) ?? 0), 0),
    [rows, bnbUsd]
  );

  return (
    <>
      <SellAllHoldingsModal
        open={sellAllOpen}
        onClose={() => setSellAllOpen(false)}
        holdings={sellAllInput}
        address={address}
        onSold={() => {
          setSellAllOpen(false);
          void load();
        }}
      />

      <SellAllHoldingsModal
        open={sellMaxTarget != null}
        onClose={() => setSellMaxTarget(null)}
        holdings={sellMaxTarget ? [sellMaxTarget] : []}
        address={address}
        variant="max"
        onSold={() => {
          setSellMaxTarget(null);
          void load();
        }}
      />

      <AdminBlock
        title="Bonding-curve holdings"
        actions={
          <div className="flex items-center gap-2">
            <AdminBtn onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </AdminBtn>
            <AdminBtn
              onClick={() => setSellAllOpen(true)}
              disabled={loading || rows.length === 0}
            >
              Sell all
            </AdminBtn>
          </div>
        }
      >
        <p className="admin-note mb-3">
          Wallet{" "}
          <a
            href={explorerAddressUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-link admin-num"
          >
            {shortAddress(address)}
          </a>
          {rows.length > 0 ? (
            <>
              {" "}
              · {rows.length} holding{rows.length === 1 ? "" : "s"} · est.{" "}
              {formatPortfolioHoldingValueUsd(totalValueUsd > 0 ? totalValueUsd : null)}
            </>
          ) : null}
        </p>

        {error ? <AdminAlert>{error}</AdminAlert> : null}

        {loading && rows.length === 0 ? (
          <p className="admin-meta">Loading holdings…</p>
        ) : rows.length === 0 ? (
          <AdminEmpty>No sellable bonding-curve holdings found for this wallet.</AdminEmpty>
        ) : (
          <AdminGridTable>
            <thead>
              <tr>
                <th>Token</th>
                <th>Value</th>
                <th>Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const valueUsd = bnbToUsd(row.estimatedValueBnb, bnbUsd);
                const sellInput: SellAllHoldingInput = {
                  tokenAddress: row.tokenAddress,
                  symbol: row.symbol,
                  name: row.name,
                  logoUrl: row.logoUrl,
                };

                return (
                  <tr key={row.tokenAddress}>
                    <td>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <TokenAvatar
                          address={row.tokenAddress}
                          symbol={row.symbol}
                          logoUrl={row.logoUrl}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">${row.symbol}</p>
                          <p className="truncate admin-meta">{row.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="admin-num whitespace-nowrap">
                      {formatPortfolioHoldingValueUsd(valueUsd)}
                    </td>
                    <td className="admin-num whitespace-nowrap">{formatTokenBalance(row.balance)}</td>
                    <td className="whitespace-nowrap text-right">
                      <AdminTextButton onClick={() => setSellMaxTarget(sellInput)}>
                        Sell max
                      </AdminTextButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </AdminGridTable>
        )}
      </AdminBlock>
    </>
  );
}

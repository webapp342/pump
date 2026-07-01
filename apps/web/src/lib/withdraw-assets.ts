import { formatUnits, parseUnits, type Address } from "viem";
import { NATIVE_SYMBOL, NATIVE_NAME } from "@/config/chain";
import { createPumpPublicClient } from "@/lib/aa/kernel-account";
import {
  DEFAULT_WITHDRAW_CALL_GAS,
  userOpPrefundFromCallGasEstimate,
} from "@/lib/aa/user-op-prefund";
import type { WalletLaunchpadHolding } from "@/lib/portfolio-onchain";

export type WithdrawAssetKind = "native" | "token";

export type WithdrawAsset = {
  id: string;
  kind: WithdrawAssetKind;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenAddress?: Address;
  balanceWei: bigint;
  estimatedValueBnb: number;
};

type PortfolioPositionRow = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenBalance: string;
  lastPriceBnb: string;
  estimatedValueBnb: number;
};

const MIN_BALANCE_WEI = parseUnits("0.000000001", 18);

export function formatWithdrawAmount(wei: bigint): string {
  const raw = formatUnits(wei, 18);
  if (!raw.includes(".")) return raw;
  const trimmed = raw.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return trimmed || "0";
}

/** Compact human-readable balance for labels (portfolio-style). */
export function formatWithdrawDisplayBalance(wei: bigint): string {
  const n = Number(formatUnits(wei, 18));
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(4);
}

/** Input display — readable without 18-decimal noise; submit uses preset wei when active. */
export function formatWithdrawInputAmount(wei: bigint): string {
  const n = Number(formatUnits(wei, 18));
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1) {
    const fixed = n.toFixed(4);
    return fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }
  return n.toFixed(6).replace(/\.?0+$/, "");
}

export function formatWithdrawAssetBalance(asset: WithdrawAsset): string {
  return formatWithdrawDisplayBalance(asset.balanceWei);
}

export function parseWithdrawAmount(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const wei = parseUnits(trimmed, 18);
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
}

export async function computeMaxNativeWithdrawWei(balanceWei: bigint): Promise<bigint> {
  if (balanceWei <= 0n) return 0n;
  const publicClient = createPumpPublicClient();
  const gasPrice = await publicClient.getGasPrice();
  const prefund = userOpPrefundFromCallGasEstimate(DEFAULT_WITHDRAW_CALL_GAS, gasPrice);
  if (balanceWei <= prefund) return 0n;
  return balanceWei - prefund;
}

export function withdrawAmountFromPercent(balanceWei: bigint, pct: number): bigint {
  if (balanceWei <= 0n || pct <= 0) return 0n;
  if (pct >= 100) return balanceWei;
  return (balanceWei * BigInt(pct)) / 100n;
}

async function fetchOnChainBalances(
  walletAddress: string,
  tokenAddresses: string[]
): Promise<Record<string, string>> {
  if (tokenAddresses.length === 0) return {};

  const response = await fetch("/api/portfolio/onchain-balances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: walletAddress, tokens: tokenAddresses }),
    cache: "no-store",
  });
  if (!response.ok) return {};
  const body = (await response.json()) as { data?: Record<string, string> };
  return body.data ?? {};
}

async function fetchExtraWalletHoldings(
  walletAddress: string,
  excludeTokenAddresses: string[]
): Promise<WalletLaunchpadHolding[]> {
  const excludeQuery =
    excludeTokenAddresses.length > 0 ? `&exclude=${excludeTokenAddresses.join(",")}` : "";
  const response = await fetch(
    `/api/portfolio/wallet-holdings?address=${encodeURIComponent(walletAddress)}&scope=creator${excludeQuery}`,
    { cache: "no-store" }
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { data?: WalletLaunchpadHolding[] };
  return body.data ?? [];
}

/** Load native + all launchpad token balances available for withdrawal. */
export async function fetchWithdrawAssets(
  walletAddress: string,
  nativeBalanceWei: bigint
): Promise<WithdrawAsset[]> {
  const assets: WithdrawAsset[] = [];

  if (nativeBalanceWei >= MIN_BALANCE_WEI) {
    assets.push({
      id: "native",
      kind: "native",
      symbol: NATIVE_SYMBOL,
      name: NATIVE_NAME,
      logoUrl: null,
      balanceWei: nativeBalanceWei,
      estimatedValueBnb: Number(formatUnits(nativeBalanceWei, 18)),
    });
  }

  const portfolioRes = await fetch(
    `/api/portfolio?address=${encodeURIComponent(walletAddress)}&createdLimit=1`,
    { cache: "no-store" }
  );
  if (!portfolioRes.ok) return assets;

  const portfolioBody = (await portfolioRes.json()) as {
    data?: { positions?: PortfolioPositionRow[] };
  };
  const positions = portfolioBody.data?.positions ?? [];
  const excludeAddresses = positions.map((position) => position.tokenAddress);
  const onChainBalances = await fetchOnChainBalances(
    walletAddress,
    positions.map((position) => position.tokenAddress)
  );

  const tokenMap = new Map<string, WithdrawAsset>();

  for (const position of positions) {
    const key = position.tokenAddress.toLowerCase();
    const balanceStr = onChainBalances[key] ?? position.tokenBalance ?? "0";
    let balanceWei: bigint;
    try {
      balanceWei = parseUnits(balanceStr, 18);
    } catch {
      continue;
    }
    if (balanceWei < MIN_BALANCE_WEI) continue;

    const price = Number(position.lastPriceBnb);
    tokenMap.set(key, {
      id: key,
      kind: "token",
      symbol: position.symbol,
      name: position.name || position.symbol,
      logoUrl: position.logoUrl,
      tokenAddress: position.tokenAddress as Address,
      balanceWei,
      estimatedValueBnb: Number(balanceStr) * (Number.isFinite(price) ? price : 0),
    });
  }

  const walletHoldings = await fetchExtraWalletHoldings(walletAddress, excludeAddresses);
  for (const holding of walletHoldings) {
    const key = holding.tokenAddress.toLowerCase();
    if (tokenMap.has(key)) continue;
    let balanceWei: bigint;
    try {
      balanceWei = parseUnits(holding.tokenBalance, 18);
    } catch {
      continue;
    }
    if (balanceWei < MIN_BALANCE_WEI) continue;

    tokenMap.set(key, {
      id: key,
      kind: "token",
      symbol: holding.symbol,
      name: holding.name || holding.symbol,
      logoUrl: holding.logoUrl,
      tokenAddress: holding.tokenAddress as Address,
      balanceWei,
      estimatedValueBnb: holding.estimatedValueBnb,
    });
  }

  const tokens = [...tokenMap.values()].sort((a, b) => b.estimatedValueBnb - a.estimatedValueBnb);
  return [...assets, ...tokens];
}

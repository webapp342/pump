"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatEther } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import { contracts, pumpChain } from "@/config/chain";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import { ClaimCreatorFeesModal } from "@/components/portfolio/ClaimCreatorFeesModal";
import { CreatorFeesCard } from "@/components/portfolio/CreatorFeesCard";
import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";
import { ClaimReferrerFeesModal } from "@/components/portfolio/ClaimReferrerFeesModal";
import { ReferralRewardsCard } from "@/components/referrals/ReferralRewardsCard";
import { FollowNetworkModal } from "@/components/portfolio/FollowNetworkModal";
import { AvatarPickerModal } from "@/components/user/AvatarPickerModal";
import { UserAvatar } from "@/components/user/UserAvatar";
import { useUserAvatar } from "@/components/user/UserAvatarProvider";
import { shortAddress } from "@/config/chain";
import { TokenBoardTable } from "@/components/arena/TokenBoardTable";
import { PortfolioPanelSkeleton } from "@/components/portfolio/PortfolioPanelSkeleton";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import type { TokenListItem } from "@/lib/db/launchpad";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import { formatCapForBoard, formatSignedPct, pctTone } from "@/lib/arena-board-format";
import {
  resolveVerifiedTokenBalance,
  scaleCostBasisForBalance,
} from "@/lib/onchain-balance";

type PortfolioPosition = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenBalance: string;
  totalBoughtBnb: string;
  totalSoldBnb: string;
  realizedPnlBnb: string;
  lastPriceBnb: string;
  estimatedValueBnb: number;
};

type PortfolioData = {
  address: string;
  totalVolumeBnb: number;
  buyVolumeBnb: number;
  sellVolumeBnb: number;
  lastTradeAt: string | null;
  creatorFeesClaimedBnb: number;
  followingCount: number;
  followerCount: number;
  positions: PortfolioPosition[];
  createdTokens: TokenListItem[];
};

type WalletLaunchpadHolding = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenBalance: string;
  lastPriceBnb: string;
  estimatedValueBnb: number;
};

type TradeRow = {
  id: string;
  side: string;
  traderAddress: string;
  nativeAmount: string;
  feeBnb?: string;
  netBnb?: string;
  tokenAmount: string;
  priceBnb: string;
  txHash: string;
  blockTime: string;
};

type DerivedLot = {
  netTokens: number;
  remainingCostBnb: number;
};

type VerifiedPositionView = {
  position: PortfolioPosition;
  balance: number;
  remainingCostBasis: number;
  avgEntry: number | null;
};

function buildVerifiedPositionView(
  position: PortfolioPosition,
  lot: DerivedLot | undefined,
  onChainBalances: Record<string, string>
): VerifiedPositionView | null {
  const totalBought = Number(position.totalBoughtBnb);
  const totalSold = Number(position.totalSoldBnb);
  const indexedBalance = lot?.netTokens ?? Number(position.tokenBalance);
  const fullCostBasis = lot?.remainingCostBnb ?? Math.max(0, totalBought - totalSold);
  const onChainStr = onChainBalances[position.tokenAddress.toLowerCase()];
  if (onChainStr == null) return null;

  const { displayBalance, hidden } = resolveVerifiedTokenBalance(
    indexedBalance,
    Number(onChainStr)
  );

  if (hidden) return null;

  const remainingCostBasis = scaleCostBasisForBalance(
    fullCostBasis,
    indexedBalance,
    displayBalance
  );

  return {
    position,
    balance: displayBalance,
    remainingCostBasis,
    avgEntry: displayBalance > 0 ? remainingCostBasis / displayBalance : null,
  };
}

function formatFeeBnb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 0.0001) return value.toFixed(6);
  return value.toFixed(8);
}

function pnlTone(value: number): string {
  if (value > 0) return "text-pump-success";
  if (value < 0) return "text-pump-danger";
  return "text-pump-text";
}

function formatTokenBalance(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function PortfolioStatBox({
  label,
  value,
  sub,
  valueClassName = "financial-value text-body-sm font-semibold text-pump-text",
  className = "",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <PortfolioMetricBox
      label={label}
      value={
        <>
          {value}
          {sub ? <span className="mt-0.5 block text-caption text-pump-muted">{sub}</span> : null}
        </>
      }
      valueClassName={valueClassName}
      className={className}
    />
  );
}

function PnlCell({ usd, pct }: { usd: number | null; pct: number | null }) {
  const tone = pct != null && Number.isFinite(pct) ? pnlTone(pct) : "text-pump-muted";
  return (
    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
      <span className={`financial-value text-body-sm font-semibold ${tone}`}>
        {formatUsdReadable(usd, { compact: true, signed: true })}
      </span>
      <span className={`financial-value text-caption font-medium ${tone}`}>
        {formatSignedPct(pct)}
      </span>
    </div>
  );
}

function WalletHoldingMobileRow({
  holding,
  bnbUsd,
}: {
  holding: WalletLaunchpadHolding;
  bnbUsd: number | null;
}) {
  const balance = Number(holding.tokenBalance);
  const positionValueUsd = bnbToUsd(balance * Number(holding.lastPriceBnb), bnbUsd);

  return (
    <article className="grid grid-cols-[1.75rem_1fr_auto] gap-x-2 gap-y-2 p-2.5">
      <TokenAvatar
        address={holding.tokenAddress}
        symbol={holding.symbol}
        logoUrl={holding.logoUrl}
        size={28}
        className="row-span-2 self-start"
      />
      <Link
        href={`/token/${holding.tokenAddress}`}
        className="self-center truncate text-body-sm font-medium text-pump-text"
      >
        ${holding.symbol}
        <span className="ml-1 text-caption font-normal text-pump-muted">· on-chain</span>
      </Link>
      <div className="self-center text-caption text-pump-muted">—</div>
      <div className="col-span-2 col-start-2 flex w-full items-center justify-between gap-2 text-[11px] leading-tight">
        <span className="financial-value min-w-0 truncate text-pump-text">
          <span className="text-pump-muted">VAL </span>
          {formatUsdReadable(positionValueUsd, { compact: true })}
        </span>
        <span className="financial-value min-w-0 truncate text-pump-text">
          <span className="text-pump-muted">BAL </span>
          {formatTokenBalance(balance)}
        </span>
        <span className="financial-value min-w-0 truncate text-right text-pump-muted">—</span>
      </div>
    </article>
  );
}

function WalletHoldingDesktopRow({
  holding,
  bnbUsd,
}: {
  holding: WalletLaunchpadHolding;
  bnbUsd: number | null;
}) {
  const balance = Number(holding.tokenBalance);
  const positionValueUsd = bnbToUsd(balance * Number(holding.lastPriceBnb), bnbUsd);

  return (
    <tr className="border-b border-pump-border/10 last:border-b-0">
      <td className="px-4 py-3">
        <Link
          href={`/token/${holding.tokenAddress}`}
          className="flex min-w-0 items-center gap-3"
        >
          <TokenAvatar
            address={holding.tokenAddress}
            symbol={holding.symbol}
            logoUrl={holding.logoUrl}
            size={30}
          />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium text-pump-text">{holding.name}</p>
            <p className="truncate text-caption text-pump-muted">
              ${holding.symbol} · on-chain
            </p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 financial-value font-semibold text-pump-text">
        {formatUsdReadable(positionValueUsd, { compact: true })}
      </td>
      <td className="px-4 py-3 financial-value text-pump-text">{formatTokenBalance(balance)}</td>
      <td className="px-4 py-3 financial-value text-pump-muted">—</td>
      <td className="px-4 py-3 text-right text-caption text-pump-muted">—</td>
    </tr>
  );
}

const BURST_POLL_MS = 1_500;
const BURST_DURATION_MS = 60_000;
const NORMAL_POLL_MS = 15_000;

function tradeNetBnb(trade: TradeRow): number {
  if (trade.netBnb != null) return Math.max(0, Number(trade.netBnb));
  const gross = Number(trade.nativeAmount);
  const fee = Number(trade.feeBnb ?? 0);
  return Math.max(0, gross - fee);
}

function computeOpenLotForAddress(trades: TradeRow[], walletAddress: string): DerivedLot {
  const target = walletAddress.toLowerCase();
  const ordered = [...trades].sort(
    (a, b) => new Date(a.blockTime).getTime() - new Date(b.blockTime).getTime()
  );

  let netTokens = 0;
  let remainingCostBnb = 0;

  for (const trade of ordered) {
    if (trade.traderAddress.toLowerCase() !== target) continue;

    const tokenAmount = Number(trade.tokenAmount);
    const bnbAmount = tradeNetBnb(trade);

    if (trade.side === "BUY") {
      netTokens += tokenAmount;
      remainingCostBnb += bnbAmount;
    } else {
      const tracked = Math.max(netTokens, 0);
      const sold = Math.min(tokenAmount, tracked);
      const avgCost = tracked > 0 ? remainingCostBnb / tracked : 0;
      netTokens = Math.max(0, tracked - sold);
      remainingCostBnb = Math.max(0, remainingCostBnb - avgCost * sold);
    }
  }

  return { netTokens, remainingCostBnb };
}

async function fetchPortfolioData(walletAddress: string): Promise<PortfolioData | null> {
  const response = await fetch(`/api/portfolio?address=${walletAddress}`, { cache: "no-store" });
  const body = (await response.json()) as { data?: PortfolioData; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Failed to load portfolio");
  return body.data ?? null;
}

async function fetchOnChainBalancesForTokens(
  walletAddress: string,
  tokenAddresses: string[]
): Promise<Record<string, string> | null> {
  if (tokenAddresses.length === 0) return {};

  const response = await fetch(
    `/api/portfolio/onchain-balances?address=${walletAddress}&tokens=${tokenAddresses.join(",")}`,
    { cache: "no-store" }
  );
  if (!response.ok) return null;

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
    `/api/portfolio/wallet-holdings?address=${walletAddress}${excludeQuery}`,
    { cache: "no-store" }
  );
  if (!response.ok) return [];

  const body = (await response.json()) as { data?: WalletLaunchpadHolding[] };
  return body.data ?? [];
}

async function fetchDerivedLotsForWallet(
  walletAddress: string,
  positions: PortfolioPosition[]
): Promise<Record<string, DerivedLot>> {
  const entries = await Promise.all(
    positions.map(async (position) => {
      try {
        const response = await fetch(`/api/tokens/${position.tokenAddress}/chart-trades`, {
          cache: "no-store",
        });
        const body = (await response.json()) as { data?: TradeRow[] };
        if (!response.ok) return [position.tokenAddress, null] as const;
        const lot = computeOpenLotForAddress(body.data ?? [], walletAddress);
        return [position.tokenAddress, lot] as const;
      } catch {
        return [position.tokenAddress, null] as const;
      }
    })
  );

  const next: Record<string, DerivedLot> = {};
  for (const [tokenAddress, lot] of entries) {
    if (lot && lot.netTokens > 0) next[tokenAddress] = lot;
  }
  return next;
}

type ReferralStats = {
  inviteCount: number;
  referralVolumeBnb: number;
  referralFeesEarnedBnb: number;
  claimedBnb: number;
};

async function fetchReferralStats(walletAddress: string): Promise<ReferralStats | null> {
  try {
    const response = await fetch(
      `/api/referrals/stats?address=${encodeURIComponent(walletAddress)}`,
      { cache: "no-store" }
    );
    const body = (await response.json()) as { data?: ReferralStats };
    if (!response.ok || !body.data) return null;
    return body.data;
  } catch {
    return null;
  }
}

type VerifiedHoldingsSnapshot = {
  onChainBalances: Record<string, string>;
  walletHoldings: WalletLaunchpadHolding[];
  derivedLots: Record<string, DerivedLot>;
};

async function fetchVerifiedHoldingsSnapshot(
  walletAddress: string,
  portfolio: PortfolioData
): Promise<VerifiedHoldingsSnapshot | null> {
  const tokenAddresses = portfolio.positions.map((position) => position.tokenAddress);

  const [onChainBalances, walletHoldings] = await Promise.all([
    fetchOnChainBalancesForTokens(walletAddress, tokenAddresses),
    fetchExtraWalletHoldings(walletAddress, tokenAddresses),
  ]);

  if (onChainBalances === null) return null;

  const derivedLots = await fetchDerivedLotsForWallet(walletAddress, portfolio.positions);

  return { onChainBalances, walletHoldings, derivedLots };
}

export function PortfolioPanel() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { bnbUsd } = useBnbUsdPrice();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [referrerClaimOpen, setReferrerClaimOpen] = useState(false);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalTab, setFollowModalTab] = useState<"following" | "followers">("following");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const { avatarId } = useUserAvatar();
  const [derivedLots, setDerivedLots] = useState<Record<string, DerivedLot>>({});
  const [walletHoldings, setWalletHoldings] = useState<WalletLaunchpadHolding[]>([]);
  const [onChainBalances, setOnChainBalances] = useState<Record<string, string>>({});
  const [holdingsReady, setHoldingsReady] = useState(false);
  const burstUntilRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenerationRef = useRef(0);
  const holdingsReadyRef = useRef(false);

  const { data: pendingWei, refetch: refetchPending } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "pendingCreatorFees",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  const { data: pendingReferrerWei, refetch: refetchReferrerPending } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "pendingReferrerFees",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  const loadPortfolio = useCallback(async (walletAddress: string) => {
    const generation = ++loadGenerationRef.current;
    const isInitial = !holdingsReadyRef.current;

    if (isInitial) {
      setLoading(true);
    }
    setError(null);

    try {
      const portfolio = await fetchPortfolioData(walletAddress);
      if (generation !== loadGenerationRef.current) return;

      if (!portfolio) {
        setData(null);
        setOnChainBalances({});
        setWalletHoldings([]);
        setDerivedLots({});
        holdingsReadyRef.current = true;
        setHoldingsReady(true);
        return;
      }

      const snapshot = await fetchVerifiedHoldingsSnapshot(walletAddress, portfolio);
      if (generation !== loadGenerationRef.current) return;

      if (snapshot === null) {
        if (isInitial) {
          setData(portfolio);
          setOnChainBalances({});
          setWalletHoldings([]);
          setDerivedLots({});
          holdingsReadyRef.current = true;
          setHoldingsReady(true);
        }
        return;
      }

      setData(portfolio);
      setOnChainBalances(snapshot.onChainBalances);
      setWalletHoldings(snapshot.walletHoldings);
      setDerivedLots(snapshot.derivedLots);
      holdingsReadyRef.current = true;
      setHoldingsReady(true);
    } catch (err) {
      if (generation !== loadGenerationRef.current) return;

      if (isInitial) {
        setData(null);
        setWalletHoldings([]);
        setOnChainBalances({});
        setDerivedLots({});
        holdingsReadyRef.current = false;
        setHoldingsReady(false);
        setError(err instanceof Error ? err.message : "Failed to load portfolio");
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      setReferralStats(null);
      return;
    }

    void fetchReferralStats(address).then((stats) => {
      setReferralStats(stats);
    });
  }, [address, isConnected]);

  useEffect(() => {
    if (!isConnected || !address) {
      loadGenerationRef.current += 1;
      holdingsReadyRef.current = false;
      setData(null);
      setWalletHoldings([]);
      setOnChainBalances({});
      setDerivedLots({});
      setHoldingsReady(false);
      setError(null);
      setLoading(false);
      return;
    }

    loadGenerationRef.current += 1;
    holdingsReadyRef.current = false;
    setData(null);
    setWalletHoldings([]);
    setOnChainBalances({});
    setDerivedLots({});
    setHoldingsReady(false);
    setLoading(true);
    void loadPortfolio(address);
  }, [address, isConnected, loadPortfolio]);

  const schedulePoll = useCallback(() => {
    if (!address) return;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    const delay = Date.now() < burstUntilRef.current ? BURST_POLL_MS : NORMAL_POLL_MS;
    pollTimerRef.current = setTimeout(async () => {
      await loadPortfolio(address);
      schedulePoll();
    }, delay);
  }, [address, loadPortfolio]);

  useEffect(() => {
    if (!isConnected || !address) return;

    const onActivity = () => {
      burstUntilRef.current = Date.now() + BURST_DURATION_MS;
      void loadPortfolio(address);
      schedulePoll();
    };

    window.addEventListener("pump:activity", onActivity);
    schedulePoll();

    return () => {
      window.removeEventListener("pump:activity", onActivity);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [address, isConnected, loadPortfolio, schedulePoll]);

  if (!isConnected || !address) {
    return (
      <div className="panel-surface p-8 text-center">
        <p className="text-body-sm text-pump-muted">
          Connect your wallet to view holdings, creator fees, and launched tokens.
        </p>
        <button
          type="button"
          onClick={() => openConnectModal?.()}
          className="primary-button mt-4 px-6"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  if (loading || !holdingsReady) {
    return <PortfolioPanelSkeleton />;
  }

  const verifiedPositionViews =
    data?.positions
      .map((position) =>
        buildVerifiedPositionView(
          position,
          derivedLots[position.tokenAddress],
          onChainBalances
        )
      )
      .filter((view): view is VerifiedPositionView => view != null) ?? [];

  const totalEstimated = verifiedPositionViews.reduce(
    (sum, view) => sum + view.balance * Number(view.position.lastPriceBnb),
    0
  );
  const totalNetPnl = verifiedPositionViews.reduce((sum, view) => {
    const openValue = view.balance * Number(view.position.lastPriceBnb);
    return sum + (openValue - view.remainingCostBasis);
  }, 0);
  const totalEstimatedUsd = bnbToUsd(totalEstimated, bnbUsd);
  const totalNetPnlUsd =
    bnbUsd != null && Number.isFinite(totalNetPnl) ? totalNetPnl * bnbUsd : null;
  const claimedBnb = data?.creatorFeesClaimedBnb ?? 0;
  const pendingBnb = pendingWei != null ? Number(formatEther(pendingWei)) : 0;
  const creatorFeesTotalBnb = claimedBnb + pendingBnb;
  const holdingsCount = verifiedPositionViews.length + walletHoldings.length;

  return (
    <>
      <ClaimCreatorFeesModal
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        claimedBnb={claimedBnb}
        onClaimed={() => {
          void refetchPending();
          if (address) void loadPortfolio(address);
        }}
      />

      <ClaimReferrerFeesModal
        open={referrerClaimOpen}
        onClose={() => setReferrerClaimOpen(false)}
        claimedBnb={referralStats?.claimedBnb ?? 0}
        inviteCount={referralStats?.inviteCount ?? 0}
        referralVolumeBnb={referralStats?.referralVolumeBnb ?? 0}
        onClaimed={() => {
          void refetchReferrerPending();
          if (address) {
            void fetchReferralStats(address).then((stats) => setReferralStats(stats));
          }
        }}
      />

      <FollowNetworkModal
        open={followModalOpen}
        onClose={() => setFollowModalOpen(false)}
        address={address}
        initialTab={followModalTab}
      />

      <AvatarPickerModal open={avatarPickerOpen} onClose={() => setAvatarPickerOpen(false)} />

      <div className="space-y-3 md:space-y-4">
        <section className="rounded-lg border border-pump-accent/25 bg-gradient-to-br from-pump-accent/12 via-pump-card/70 to-pump-surface/55 p-3 md:p-4">
          <div className="flex items-center gap-3">
            {avatarId ? (
              <button
                type="button"
                onClick={() => setAvatarPickerOpen(true)}
                className="shrink-0 rounded-full transition hover:opacity-90"
                aria-label="Change avatar"
              >
                <UserAvatar address={address} avatarId={avatarId} size={48} />
              </button>
            ) : (
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-pump-surface/60 md:h-14 md:w-14" />
            )}
            <div className="min-w-0 flex-1">
              <p className="financial-value text-body-sm font-semibold text-pump-text md:text-body">
                {shortAddress(address)}
              </p>
              <button
                type="button"
                onClick={() => setAvatarPickerOpen(true)}
                className="mt-0.5 text-caption font-medium text-pump-accent hover:underline"
              >
                Change avatar
              </button>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption md:mt-2 md:text-body-sm">
                <button
                  type="button"
                  onClick={() => {
                    setFollowModalTab("following");
                    setFollowModalOpen(true);
                  }}
                  className="financial-value font-semibold text-pump-text transition hover:text-pump-accent"
                >
                  {data?.followingCount ?? 0} following
                </button>
                <span className="text-pump-muted">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setFollowModalTab("followers");
                    setFollowModalOpen(true);
                  }}
                  className="financial-value font-semibold text-pump-text transition hover:text-pump-accent"
                >
                  {data?.followerCount ?? 0} followers
                </button>
              </div>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 items-stretch gap-2 md:mt-4 lg:grid-cols-4">
            <PortfolioStatBox
              label="Portfolio value"
              value={formatUsdReadable(totalEstimatedUsd, { compact: true })}
            />
            <PortfolioStatBox
              label="Net PnL"
              value={formatUsdReadable(totalNetPnlUsd, { compact: true, signed: true })}
              valueClassName={`financial-value text-body-sm font-semibold ${pnlTone(totalNetPnl)}`}
            />
            <CreatorFeesCard
              totalBnb={creatorFeesTotalBnb}
              bnbUsd={bnbUsd}
              onOpenModal={() => setClaimOpen(true)}
            />
            {address ? (
              <ReferralRewardsCard
                address={address}
                claimedBnb={referralStats?.claimedBnb ?? 0}
                pendingWei={pendingReferrerWei}
                bnbUsd={bnbUsd}
                onOpenModal={() => setReferrerClaimOpen(true)}
              />
            ) : null}
          </dl>
        </section>

        {error ? <div className="notice-error p-4">{error}</div> : null}

        {data && !error ? (
          <>
            <div className="space-y-2 md:space-y-3">
              <h3 className="section-heading text-h3">Holdings ({holdingsCount})</h3>
              {holdingsCount === 0 ? (
                <p className="panel-surface p-6 text-center text-body-sm text-pump-muted">
                  No open positions. Buy from the Arena.
                </p>
              ) : (
                <section className="rounded-lg border border-pump-border/15 bg-transparent">
                  <div className="lg:hidden divide-y divide-pump-border/10">
                    {verifiedPositionViews.map((view) => {
                      const { position, balance, remainingCostBasis, avgEntry } = view;
                      const avgEntryUsd = avgEntry != null ? bnbToUsd(avgEntry, bnbUsd) : null;
                      const positionValueUsd = bnbToUsd(
                        balance * Number(position.lastPriceBnb),
                        bnbUsd
                      );
                      const netPnl = balance * Number(position.lastPriceBnb) - remainingCostBasis;
                      const netPnlUsd = bnbUsd != null ? netPnl * bnbUsd : null;
                      const netPnlPct =
                        remainingCostBasis > 0 ? (netPnl / remainingCostBasis) * 100 : null;

                      return (
                        <article
                          key={position.tokenAddress}
                          className="grid grid-cols-[1.75rem_1fr_auto] gap-x-2 gap-y-2 p-2.5"
                        >
                          <TokenAvatar
                            address={position.tokenAddress}
                            symbol={position.symbol}
                            logoUrl={position.logoUrl}
                            size={28}
                            className="row-span-2 self-start"
                          />
                          <Link
                            href={`/token/${position.tokenAddress}`}
                            className="self-center truncate text-body-sm font-medium text-pump-text"
                          >
                            ${position.symbol}
                          </Link>
                          <div className="self-center">
                            <PnlCell usd={netPnlUsd} pct={netPnlPct} />
                          </div>
                          <div className="col-span-2 col-start-2 flex w-full items-center justify-between gap-2 text-[11px] leading-tight">
                            <span className="financial-value min-w-0 truncate text-pump-text">
                              <span className="text-pump-muted">VAL </span>
                              {formatUsdReadable(positionValueUsd, { compact: true })}
                            </span>
                            <span className="financial-value min-w-0 truncate text-pump-text">
                              <span className="text-pump-muted">BAL </span>
                              {formatTokenBalance(balance)}
                            </span>
                            <span className="financial-value min-w-0 truncate text-right text-pump-text">
                              <span className="text-pump-muted">ENTRY </span>
                              {formatUsdReadable(avgEntryUsd, { compact: true })}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                    {walletHoldings.map((holding) => (
                      <WalletHoldingMobileRow
                        key={holding.tokenAddress}
                        holding={holding}
                        bnbUsd={bnbUsd}
                      />
                    ))}
                  </div>

                  <div className="hidden lg:block overflow-x-auto">
                    <table className="sheet-grid min-w-[820px]">
                      <thead>
                        <tr>
                          <th>Coin</th>
                          <th>Value</th>
                          <th>Balance</th>
                          <th>Entry</th>
                          <th className="text-right">Net PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verifiedPositionViews.map((view) => {
                          const { position, balance, remainingCostBasis, avgEntry } = view;
                          const avgEntryUsd = avgEntry != null ? bnbToUsd(avgEntry, bnbUsd) : null;
                          const positionValueUsd = bnbToUsd(
                            balance * Number(position.lastPriceBnb),
                            bnbUsd
                          );
                          const netPnl =
                            balance * Number(position.lastPriceBnb) - remainingCostBasis;
                          const netPnlUsd = bnbUsd != null ? netPnl * bnbUsd : null;
                          const netPnlPct =
                            remainingCostBasis > 0 ? (netPnl / remainingCostBasis) * 100 : null;

                          return (
                            <tr key={position.tokenAddress}>
                              <td>
                                <Link
                                  href={`/token/${position.tokenAddress}`}
                                  className="flex min-w-0 items-center gap-3"
                                >
                                  <TokenAvatar
                                    address={position.tokenAddress}
                                    symbol={position.symbol}
                                    logoUrl={position.logoUrl}
                                    size={30}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-body-sm font-medium text-pump-text">
                                      {position.name}
                                    </p>
                                    <p className="truncate text-caption text-pump-muted">
                                      ${position.symbol}
                                    </p>
                                  </div>
                                </Link>
                              </td>
                              <td className="px-4 py-3 financial-value font-semibold text-pump-text">
                                {formatUsdReadable(positionValueUsd, { compact: true })}
                              </td>
                              <td className="px-4 py-3 financial-value text-pump-text">
                                {formatTokenBalance(balance)}
                              </td>
                              <td className="px-4 py-3 financial-value text-pump-text">
                                {formatUsdReadable(avgEntryUsd, { compact: true })}
                              </td>
                              <td className="px-4 py-3">
                                <PnlCell usd={netPnlUsd} pct={netPnlPct} />
                              </td>
                            </tr>
                          );
                        })}
                        {walletHoldings.map((holding) => (
                          <WalletHoldingDesktopRow
                            key={holding.tokenAddress}
                            holding={holding}
                            bnbUsd={bnbUsd}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-2 md:space-y-3">
              <h3 className="section-heading text-h3">
                Created ({data.createdTokens.length})
              </h3>
              {data.createdTokens.length === 0 ? (
                <p className="panel-surface p-6 text-center text-body-sm text-pump-muted">
                  No launched tokens yet.{" "}
                  <Link href="/create" className="text-pump-accent hover:underline">
                    Create one
                  </Link>
                </p>
              ) : (
                <section className="rounded-lg border border-pump-border/15 bg-transparent">
                  <div className="lg:hidden divide-y divide-pump-border/10">
                    {data.createdTokens.map((token) => {
                      const mcapUsd = bnbToUsd(Number(token.marketCapBnb), bnbUsd);
                      const vol24hUsd = bnbToUsd(Number(token.volume24hBnb ?? 0), bnbUsd);
                      return (
                        <article
                          key={token.address}
                          className="grid grid-cols-[1.75rem_1fr] gap-x-2 gap-y-2 p-2.5"
                        >
                          <TokenAvatar
                            address={token.address}
                            symbol={token.symbol}
                            logoUrl={token.logoUrl}
                            size={28}
                            className="row-span-2 self-start"
                          />
                          <Link
                            href={`/token/${token.address}`}
                            className="self-center truncate text-body-sm font-medium text-pump-text"
                          >
                            ${token.symbol}
                          </Link>
                          <div className="col-start-2 flex w-full items-center justify-between gap-1 text-[11px] leading-tight">
                            <span className="financial-value min-w-0 truncate text-pump-text">
                              <span className="text-pump-muted">MCAP </span>
                              {formatCapForBoard(mcapUsd)}
                            </span>
                            <span className="financial-value min-w-0 truncate text-pump-text">
                              <span className="text-pump-muted">TXN </span>
                              {token.tradeCount ?? 0}
                            </span>
                            <span className="financial-value min-w-0 truncate text-pump-text">
                              <span className="text-pump-muted">VOL </span>
                              {formatUsdReadable(vol24hUsd, { compact: true })}
                            </span>
                            <span
                              className={`financial-value shrink-0 text-right ${pctTone(token.change24hPct ?? null)}`}
                            >
                              <span className="text-pump-muted">24H </span>
                              {formatSignedPct(token.change24hPct ?? null)}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="hidden lg:block">
                    <TokenBoardTable tokens={data.createdTokens} bnbUsd={bnbUsd} variant="created" />
                  </div>
                </section>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

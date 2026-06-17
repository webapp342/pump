"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatEther } from "viem";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import { contracts, pumpChain } from "@/config/chain";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import { ClaimCreatorFeesModal } from "@/components/portfolio/ClaimCreatorFeesModal";
import { CreatorFeesCard } from "@/components/portfolio/CreatorFeesCard";
import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";
import type { LucideIcon } from "lucide-react";
import { MetricIcons } from "@/lib/metric-icons";
import { ICON_STROKE } from "@/lib/icons";
import { ClaimReferrerFeesModal } from "@/components/portfolio/ClaimReferrerFeesModal";
import { ReferralRewardsCard } from "@/components/referrals/ReferralRewardsCard";
import { FollowNetworkModal } from "@/components/portfolio/FollowNetworkModal";
import { AvatarPickerModal } from "@/components/user/AvatarPickerModal";
import { UserAvatar } from "@/components/user/UserAvatar";
import { useUserAvatar } from "@/components/user/UserAvatarProvider";
import { shortAddress } from "@/config/chain";
import { TokenBoardTable } from "@/components/arena/TokenBoardTable";
import { PortfolioAirdropsSection } from "@/components/portfolio/PortfolioAirdropsSection";
import { SellAllHoldingsModal } from "@/components/portfolio/SellAllHoldingsModal";
import { PortfolioPanelSkeleton } from "@/components/portfolio/PortfolioPanelSkeleton";
import { HoldingSwipeRow } from "@/components/portfolio/HoldingSwipeRow";
import { HoldingsSwipeHint } from "@/components/portfolio/HoldingsSwipeHint";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TradeSheet } from "@/components/token/TradeSheet";
import type { TokenListItem } from "@/lib/db/launchpad";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import { PctChange } from "@/components/ui/PctChange";
import { formatCapForBoard } from "@/lib/arena-board-format";
import {
  PORTFOLIO_CREATOR_WALLET_SCAN_MAX,
  PORTFOLIO_HOLDINGS_INCREMENT,
  PORTFOLIO_HOLDINGS_INITIAL,
  PORTFOLIO_LAUNCHED_INCREMENT,
  PORTFOLIO_LAUNCHED_INITIAL,
  PORTFOLIO_ONCHAIN_BALANCE_CHUNK,
  PORTFOLIO_ONCHAIN_VERIFY_INITIAL,
  PORTFOLIO_DUST_MIN_VALUE_USD,
} from "@/lib/portfolio-limits";
import {
  isPortfolioDustHolding,
  portfolioDustLabel,
  readPortfolioShowDust,
  writePortfolioShowDust,
} from "@/lib/portfolio-dust";
import {
  resolveVerifiedTokenBalance,
  scaleCostBasisForBalance,
} from "@/lib/onchain-balance";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";
import { walletRoom } from "@/lib/db/perf-flags";

type PortfolioPosition = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenBalance: string;
  totalBoughtBnb: string;
  totalSoldBnb: string;
  realizedPnlBnb: string;
  remainingCostBasisBnb: string;
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
  createdTokensTotal: number;
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

type PortfolioQuickTradeTarget = {
  tokenAddress: `0x${string}`;
  symbol: string;
  side: "buy" | "sell";
};

type VerifiedPositionView = {
  position: PortfolioPosition;
  balance: number;
  remainingCostBasis: number;
  avgEntry: number | null;
  realizedPnlBnb: number;
};

type FlashTone = "up" | "down";

function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

function buildVerifiedPositionView(
  position: PortfolioPosition,
  onChainBalances: Record<string, string>
): VerifiedPositionView | null {
  const indexedBalance = Number(position.tokenBalance);
  const fullCostBasis = Math.max(0, Number(position.remainingCostBasisBnb));
  const onChainStr = onChainBalances[position.tokenAddress.toLowerCase()];
  const onChainBalance = onChainStr != null ? Number(onChainStr) : null;

  const { displayBalance, hidden } = resolveVerifiedTokenBalance(
    indexedBalance,
    onChainBalance
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
    realizedPnlBnb: Number(position.realizedPnlBnb),
  };
}

/** Open-lot PnL (mark-to-market minus cost basis). */
function holdingOpenPnlBnb(view: VerifiedPositionView): number {
  return view.balance * Number(view.position.lastPriceBnb) - view.remainingCostBasis;
}

/** Unrealized + cumulative realized for this wallet+token (matches hero Net PnL). */
function holdingNetPnlBnb(view: VerifiedPositionView): number {
  return holdingOpenPnlBnb(view) + view.realizedPnlBnb;
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
  icon,
  value,
  sub,
  valueClassName = "financial-value text-body-sm font-semibold text-pump-text",
  className = "",
}: {
  label: string;
  icon?: LucideIcon;
  value: ReactNode;
  sub?: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <PortfolioMetricBox
      label={label}
      icon={icon}
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

function PnlCell({
  usd,
  pct,
  align = "end",
}: {
  usd: number | null;
  pct: number | null;
  align?: "start" | "end";
}) {
  const tone = pct != null && Number.isFinite(pct) ? pnlTone(pct) : "text-pump-muted";
  return (
    <div
      className={`flex items-center gap-2 whitespace-nowrap ${align === "start" ? "justify-start" : "justify-end"}`}
    >
      <span className={`financial-value text-body-sm font-semibold ${tone}`}>
        {formatUsdReadable(usd, { compact: true, signed: true })}
      </span>
      <PctChange
        value={pct}
        className="text-caption font-medium"
        toneClassName={tone}
      />
    </div>
  );
}

function HoldingQuickActions({
  onBuyMax,
  onSellMax,
}: {
  onBuyMax: () => void;
  onSellMax: () => void;
}) {
  const baseClass =
    "shrink-0 rounded px-2 py-0.5 text-caption font-semibold transition-[opacity,background-color,border-color,color] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pump-success/40";

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        title="Buy max"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onBuyMax();
        }}
        className={`${baseClass} border border-pump-success/30 bg-pump-success/8 text-pump-success/85 hover:border-pump-success/50 hover:bg-pump-success/15 hover:text-pump-success group-hover:border-pump-success/45 group-hover:bg-pump-success/12 group-hover:text-pump-success`}
      >
        Buy max
      </button>
      <button
        type="button"
        title="Sell max"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSellMax();
        }}
        className={`${baseClass} border border-pump-danger/30 bg-pump-danger/8 text-pump-danger/85 hover:border-pump-danger/50 hover:bg-pump-danger/15 hover:text-pump-danger group-hover:border-pump-danger/45 group-hover:bg-pump-danger/12 group-hover:text-pump-danger`}
      >
        Sell max
      </button>
    </div>
  );
}

function WalletHoldingMobileRow({
  holding,
  bnbUsd,
  onBuyMax,
  onSellMax,
  peekOnMount = false,
}: {
  holding: WalletLaunchpadHolding;
  bnbUsd: number | null;
  onBuyMax: () => void;
  onSellMax: () => void;
  peekOnMount?: boolean;
}) {
  const balance = Number(holding.tokenBalance);
  const positionValueUsd = bnbToUsd(balance * Number(holding.lastPriceBnb), bnbUsd);

  return (
    <HoldingSwipeRow onBuyMax={onBuyMax} onSellMax={onSellMax} peekOnMount={peekOnMount}>
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
    </HoldingSwipeRow>
  );
}

function WalletHoldingDesktopRow({
  holding,
  bnbUsd,
  onBuyMax,
  onSellMax,
}: {
  holding: WalletLaunchpadHolding;
  bnbUsd: number | null;
  onBuyMax: () => void;
  onSellMax: () => void;
}) {
  const balance = Number(holding.tokenBalance);
  const positionValueUsd = bnbToUsd(balance * Number(holding.lastPriceBnb), bnbUsd);

  return (
    <tr className="group border-b border-pump-border/10 last:border-b-0">
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
      <td className="w-[1%] whitespace-nowrap px-4 py-3 text-caption text-pump-muted">—</td>
      <td className="w-[1%] whitespace-nowrap px-4 py-3">
        <HoldingQuickActions onBuyMax={onBuyMax} onSellMax={onSellMax} />
      </td>
    </tr>
  );
}

type PortfolioHoldingRow =
  | { kind: "position"; view: VerifiedPositionView; estimatedValueBnb: number }
  | { kind: "wallet"; holding: WalletLaunchpadHolding; estimatedValueBnb: number };

function buildPortfolioHoldingRows(
  verifiedPositionViews: VerifiedPositionView[],
  walletHoldings: WalletLaunchpadHolding[]
): PortfolioHoldingRow[] {
  const rows: PortfolioHoldingRow[] = [
    ...verifiedPositionViews.map((view) => ({
      kind: "position" as const,
      view,
      estimatedValueBnb: view.balance * Number(view.position.lastPriceBnb),
    })),
    ...walletHoldings.map((holding) => ({
      kind: "wallet" as const,
      holding,
      estimatedValueBnb: Number(holding.tokenBalance) * Number(holding.lastPriceBnb),
    })),
  ];

  return rows.sort((a, b) => b.estimatedValueBnb - a.estimatedValueBnb);
}

const BURST_DURATION_MS = 60_000;

async function fetchPortfolioData(
  walletAddress: string,
  createdLimit = PORTFOLIO_LAUNCHED_INITIAL
): Promise<PortfolioData | null> {
  const response = await fetch(
    `/api/portfolio?address=${encodeURIComponent(walletAddress)}&createdLimit=${createdLimit}`,
    { cache: "no-store" }
  );
  const body = (await response.json()) as { data?: PortfolioData; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Failed to load portfolio");
  return body.data ?? null;
}

async function fetchCreatedTokensPage(
  walletAddress: string,
  limit: number,
  offset: number
): Promise<{ tokens: TokenListItem[]; total: number; hasMore: boolean }> {
  const response = await fetch(
    `/api/portfolio/created-tokens?address=${encodeURIComponent(walletAddress)}&limit=${limit}&offset=${offset}`,
    { cache: "no-store" }
  );
  const body = (await response.json()) as {
    data?: { tokens: TokenListItem[]; total: number; hasMore: boolean };
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Failed to load launched tokens");
  return body.data ?? { tokens: [], total: 0, hasMore: false };
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
  excludeTokenAddresses: string[],
  scanLimit?: number
): Promise<WalletLaunchpadHolding[]> {
  const excludeQuery =
    excludeTokenAddresses.length > 0 ? `&exclude=${excludeTokenAddresses.join(",")}` : "";
  const scanQuery =
    scanLimit != null && scanLimit > 0 ? `&scanLimit=${scanLimit}` : "";
  const response = await fetch(
    `/api/portfolio/wallet-holdings?address=${encodeURIComponent(walletAddress)}&scope=creator${excludeQuery}${scanQuery}`,
    { cache: "no-store" }
  );
  if (!response.ok) return [];

  const body = (await response.json()) as { data?: WalletLaunchpadHolding[] };
  return body.data ?? [];
}

type HoldingsEnrichmentOptions = {
  onChainPositionLimit?: number;
  walletScanLimit?: number;
};

type VerifiedHoldingsSnapshot = {
  onChainBalances: Record<string, string>;
  walletHoldings: WalletLaunchpadHolding[];
};

async function fetchVerifiedHoldingsSnapshot(
  walletAddress: string,
  portfolio: PortfolioData,
  options?: HoldingsEnrichmentOptions
): Promise<VerifiedHoldingsSnapshot> {
  const onChainLimit = options?.onChainPositionLimit;
  const positionsForOnChain =
    onChainLimit != null && onChainLimit > 0
      ? portfolio.positions.slice(0, onChainLimit)
      : portfolio.positions;
  const excludeAddresses = portfolio.positions.map((position) => position.tokenAddress);

  const [onChainBalances, walletHoldings] = await Promise.all([
    fetchOnChainBalancesForTokens(
      walletAddress,
      positionsForOnChain.map((position) => position.tokenAddress)
    ),
    fetchExtraWalletHoldings(walletAddress, excludeAddresses, options?.walletScanLimit),
  ]);

  return { onChainBalances, walletHoldings };
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

export function PortfolioPanel() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();
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
  const [walletHoldings, setWalletHoldings] = useState<WalletLaunchpadHolding[]>([]);
  const [onChainBalances, setOnChainBalances] = useState<Record<string, string>>({});
  const [holdingsReady, setHoldingsReady] = useState(false);
  const [holdingsEnriching, setHoldingsEnriching] = useState(false);
  const [createdLimit, setCreatedLimit] = useState(PORTFOLIO_LAUNCHED_INITIAL);
  const createdLimitRef = useRef(PORTFOLIO_LAUNCHED_INITIAL);
  const [holdingsVisibleLimit, setHoldingsVisibleLimit] = useState(PORTFOLIO_HOLDINGS_INITIAL);
  const [showDustHoldings, setShowDustHoldings] = useState(false);
  const [sellAllOpen, setSellAllOpen] = useState(false);
  const [loadingMoreCreated, setLoadingMoreCreated] = useState(false);
  const [quickTradeTarget, setQuickTradeTarget] = useState<PortfolioQuickTradeTarget | null>(null);
  const [holdingFlashes, setHoldingFlashes] = useState<Record<string, FlashTone>>({});
  const [totalValueFlash, setTotalValueFlash] = useState<FlashTone | undefined>();
  const [totalPnlFlash, setTotalPnlFlash] = useState<FlashTone | undefined>();
  const metricsPrevRef = useRef<{
    values: Record<string, number>;
    total: number;
    pnl: number;
  } | null>(null);
  const holdingFlashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const burstUntilRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenerationRef = useRef(0);
  const enrichGenerationRef = useRef(0);
  const holdingsReadyRef = useRef(false);
  const isInitialPortfolioLoadRef = useRef(true);
  const lastEnrichFingerprintRef = useRef("");
  const bnbUsdForDustRef = useRef<number | null>(null);
  const loadPortfolioRef = useRef<(wallet: string, limit?: number) => Promise<void>>(async () => {});

  const { connected: wsConnected } = useLiveChannel({
    room: address ? walletRoom(address) : "wallet:disconnected",
    enabled: Boolean(isConnected && address),
    onMessage: (payload) => {
      const message = payload as { type?: string };
      if (message.type === "wallet_trade" && address) {
        burstUntilRef.current = Date.now() + BURST_DURATION_MS;
        void loadPortfolioRef.current(address);
      }
    },
  });

  useEffect(() => {
    setShowDustHoldings(readPortfolioShowDust());
  }, []);

  const toggleShowDustHoldings = useCallback(() => {
    setShowDustHoldings((current) => {
      const next = !current;
      writePortfolioShowDust(next);
      return next;
    });
  }, []);

  const enrichHoldings = useCallback(
    async (
      walletAddress: string,
      portfolio: PortfolioData,
      options?: { silent?: boolean }
    ) => {
    const generation = ++enrichGenerationRef.current;
    if (!options?.silent) {
      setHoldingsEnriching(true);
    }

    try {
      const snapshot = await fetchVerifiedHoldingsSnapshot(walletAddress, portfolio, {
        onChainPositionLimit: PORTFOLIO_ONCHAIN_VERIFY_INITIAL,
        walletScanLimit: PORTFOLIO_CREATOR_WALLET_SCAN_MAX,
      });
      if (generation !== enrichGenerationRef.current) return;

      setOnChainBalances(snapshot.onChainBalances);
      setWalletHoldings(snapshot.walletHoldings);
      holdingsReadyRef.current = true;
      setHoldingsReady(true);
    } catch {
      if (generation !== enrichGenerationRef.current) return;
      holdingsReadyRef.current = true;
      setHoldingsReady(true);
    } finally {
      if (generation === enrichGenerationRef.current && !options?.silent) {
        setHoldingsEnriching(false);
      }
    }
  },
  []);

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

  const loadPortfolio = useCallback(
    async (walletAddress: string, launchedLimit?: number) => {
      const limit = launchedLimit ?? createdLimitRef.current;
      const generation = ++loadGenerationRef.current;
      const isInitial = isInitialPortfolioLoadRef.current;

      if (isInitial) {
        setLoading(true);
      }
      setError(null);

      try {
        const portfolio = await fetchPortfolioData(walletAddress, limit);
        if (generation !== loadGenerationRef.current) return;

        if (!portfolio) {
          enrichGenerationRef.current += 1;
          setData(null);
          setOnChainBalances({});
          setWalletHoldings([]);
          holdingsReadyRef.current = true;
          setHoldingsReady(true);
          setHoldingsEnriching(false);
          isInitialPortfolioLoadRef.current = true;
          return;
        }

        setData(portfolio);
        isInitialPortfolioLoadRef.current = false;

        const fingerprint = portfolio.positions
          .map(
            (position) =>
              `${position.tokenAddress}:${position.tokenBalance}:${position.lastPriceBnb}`
          )
          .join("|");
        const needsEnrich =
          !holdingsReadyRef.current || fingerprint !== lastEnrichFingerprintRef.current;
        if (needsEnrich) {
          lastEnrichFingerprintRef.current = fingerprint;
          void enrichHoldings(walletAddress, portfolio, {
            silent: holdingsReadyRef.current,
          });
        }
      } catch (err) {
        if (generation !== loadGenerationRef.current) return;

        if (isInitial) {
          setData(null);
          setWalletHoldings([]);
          setOnChainBalances({});
          holdingsReadyRef.current = false;
          setHoldingsReady(false);
          setHoldingsEnriching(false);
          isInitialPortfolioLoadRef.current = true;
          setError(err instanceof Error ? err.message : "Failed to load portfolio");
        }
      } finally {
        if (generation === loadGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [enrichHoldings]
  );

  loadPortfolioRef.current = loadPortfolio;

  const loadMoreCreatedTokens = useCallback(async () => {
    if (!address || loadingMoreCreated || !data) return;
    const offset = data.createdTokens.length;
    if (offset >= data.createdTokensTotal) return;

    setLoadingMoreCreated(true);
    try {
      const page = await fetchCreatedTokensPage(
        address,
        PORTFOLIO_LAUNCHED_INCREMENT,
        offset
      );
      setData((current) => {
        if (!current) return current;
        const merged = [...current.createdTokens, ...page.tokens];
        return {
          ...current,
          createdTokens: merged,
          createdTokensTotal: page.total,
        };
      });
      const nextCount = offset + page.tokens.length;
      createdLimitRef.current = nextCount;
      setCreatedLimit(nextCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more launched tokens");
    } finally {
      setLoadingMoreCreated(false);
    }
  }, [address, data, loadingMoreCreated]);

  const openQuickTrade = useCallback(
    (tokenAddress: string, symbol: string, side: "buy" | "sell") => {
      if (!isConnected) {
        openConnectModal?.();
        return;
      }
      setQuickTradeTarget({
        tokenAddress: tokenAddress.toLowerCase() as `0x${string}`,
        symbol,
        side,
      });
    },
    [isConnected, openConnectModal]
  );

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
      enrichGenerationRef.current += 1;
      isInitialPortfolioLoadRef.current = true;
      holdingsReadyRef.current = false;
      lastEnrichFingerprintRef.current = "";
      setData(null);
      setWalletHoldings([]);
      setOnChainBalances({});
      setHoldingsReady(false);
      setHoldingsEnriching(false);
      setError(null);
      setLoading(false);
      createdLimitRef.current = PORTFOLIO_LAUNCHED_INITIAL;
      setCreatedLimit(PORTFOLIO_LAUNCHED_INITIAL);
      setHoldingsVisibleLimit(PORTFOLIO_HOLDINGS_INITIAL);
      return;
    }

    loadGenerationRef.current += 1;
    enrichGenerationRef.current += 1;
    isInitialPortfolioLoadRef.current = true;
    holdingsReadyRef.current = false;
    lastEnrichFingerprintRef.current = "";
    setData(null);
    setWalletHoldings([]);
    setOnChainBalances({});
    setHoldingsReady(false);
    setHoldingsEnriching(false);
    setLoading(true);
    createdLimitRef.current = PORTFOLIO_LAUNCHED_INITIAL;
    setCreatedLimit(PORTFOLIO_LAUNCHED_INITIAL);
    setHoldingsVisibleLimit(PORTFOLIO_HOLDINGS_INITIAL);
    void loadPortfolio(address, PORTFOLIO_LAUNCHED_INITIAL);
  }, [address, isConnected, loadPortfolio]);

  const schedulePoll = useCallback(() => {
    if (!address) return;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    const delay = resolveLivePollDelay(wsConnected, false, burstUntilRef.current);
    pollTimerRef.current = setTimeout(async () => {
      await loadPortfolio(address);
      schedulePoll();
    }, delay);
  }, [address, loadPortfolio, wsConnected]);

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

  useEffect(() => {
    if (!data) return;

    const views =
      data.positions
        .map((position) =>
          buildVerifiedPositionView(position, onChainBalances)
        )
        .filter((view): view is VerifiedPositionView => view != null);

    const values: Record<string, number> = {};
    let totalValue = 0;
    let totalPnl = 0;

    for (const view of views) {
      const key = view.position.tokenAddress.toLowerCase();
      const val = view.balance * Number(view.position.lastPriceBnb);
      values[key] = val;
      totalValue += val;
      totalPnl += holdingNetPnlBnb(view);
    }

    for (const holding of walletHoldings) {
      const key = holding.tokenAddress.toLowerCase();
      const val = Number(holding.tokenBalance) * Number(holding.lastPriceBnb);
      values[key] = val;
      totalValue += val;
    }

    const prev = metricsPrevRef.current;
    if (prev) {
      const nextFlashes: Record<string, FlashTone> = {};
      for (const [key, val] of Object.entries(values)) {
        const previous = prev.values[key];
        if (previous == null || Math.abs(val - previous) < 1e-12) continue;
        nextFlashes[key] = val > previous ? "up" : "down";
      }

      if (Object.keys(nextFlashes).length > 0) {
        setHoldingFlashes((current) => ({ ...current, ...nextFlashes }));
        for (const [key, tone] of Object.entries(nextFlashes)) {
          const existing = holdingFlashTimersRef.current[key];
          if (existing) clearTimeout(existing);
          holdingFlashTimersRef.current[key] = setTimeout(() => {
            setHoldingFlashes((current) => {
              const next = { ...current };
              delete next[key];
              return next;
            });
            delete holdingFlashTimersRef.current[key];
          }, 700);
        }
      }

      if (Math.abs(totalValue - prev.total) >= 1e-12) {
        setTotalValueFlash(totalValue > prev.total ? "up" : "down");
        window.setTimeout(() => setTotalValueFlash(undefined), 700);
      }
      if (Math.abs(totalPnl - prev.pnl) >= 1e-12) {
        setTotalPnlFlash(totalPnl > prev.pnl ? "up" : "down");
        window.setTimeout(() => setTotalPnlFlash(undefined), 700);
      }
    }

    metricsPrevRef.current = { values, total: totalValue, pnl: totalPnl };
  }, [data, onChainBalances, walletHoldings]);

  if (!isConnected || !address) {
    return (
      <div className="panel-surface empty-state">
        <p className="empty-state-copy">
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

  if (loading && !data) {
    return <PortfolioPanelSkeleton />;
  }

  if (!data) {
    return (
      <div className="panel-surface empty-state">
        <p className="empty-state-copy">
          {error ?? "Failed to load portfolio."}
        </p>
      </div>
    );
  }

  const verifiedPositionViews =
    data.positions
      .map((position) =>
        buildVerifiedPositionView(position, onChainBalances)
      )
      .filter((view): view is VerifiedPositionView => view != null);

  if (bnbUsd != null) {
    bnbUsdForDustRef.current = bnbUsd;
  }
  const bnbUsdForDust = bnbUsd ?? bnbUsdForDustRef.current;

  const allHoldingsRows = buildPortfolioHoldingRows(verifiedPositionViews, walletHoldings);
  const awaitingDustFilter =
    !showDustHoldings && bnbUsdForDust == null && allHoldingsRows.length > 0;
  const dustHoldingsCount = allHoldingsRows.filter((row) =>
    isPortfolioDustHolding(row.estimatedValueBnb, bnbUsdForDust)
  ).length;
  const displayHoldingsRows = showDustHoldings
    ? allHoldingsRows
    : allHoldingsRows.filter(
        (row) => !isPortfolioDustHolding(row.estimatedValueBnb, bnbUsdForDust)
      );

  const metricViews = showDustHoldings
    ? verifiedPositionViews
    : verifiedPositionViews.filter(
        (view) =>
          !isPortfolioDustHolding(
            view.balance * Number(view.position.lastPriceBnb),
            bnbUsdForDust
          )
      );

  const totalEstimated = metricViews.reduce(
    (sum, view) => sum + view.balance * Number(view.position.lastPriceBnb),
    0
  );
  const totalUnrealizedPnl = metricViews.reduce(
    (sum, view) => sum + holdingOpenPnlBnb(view),
    0
  );
  const totalRealizedPnl = metricViews.reduce((sum, view) => sum + view.realizedPnlBnb, 0);
  const totalNetPnl = totalUnrealizedPnl + totalRealizedPnl;
  const totalEstimatedUsd = bnbToUsd(totalEstimated, bnbUsd);
  const totalNetPnlUsd =
    bnbUsd != null && Number.isFinite(totalNetPnl) ? totalNetPnl * bnbUsd : null;
  const totalCostBasis = metricViews.reduce(
    (sum, view) => sum + view.remainingCostBasis,
    0
  );
  const portfolioValuePct =
    totalCostBasis > 0 ? (totalUnrealizedPnl / totalCostBasis) * 100 : null;
  const claimedBnb = data.creatorFeesClaimedBnb ?? 0;
  const pendingBnb = pendingWei != null ? Number(formatEther(pendingWei)) : 0;
  const creatorFeesTotalBnb = claimedBnb + pendingBnb;
  const holdingsCount = displayHoldingsRows.length;
  const totalHoldingsCount = allHoldingsRows.length;
  const visibleHoldingsRows = displayHoldingsRows.slice(0, holdingsVisibleLimit);
  const hasMoreHoldings = visibleHoldingsRows.length < displayHoldingsRows.length;
  const sellAllHoldingsInput = displayHoldingsRows.flatMap((row) => {
    if (row.kind === "position") {
      return [
        {
          tokenAddress: row.view.position.tokenAddress,
          symbol: row.view.position.symbol,
          name: row.view.position.name,
          logoUrl: row.view.position.logoUrl,
        },
      ];
    }
    return [
      {
        tokenAddress: row.holding.tokenAddress,
        symbol: row.holding.symbol,
        name: row.holding.name,
        logoUrl: row.holding.logoUrl,
      },
    ];
  });

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

      <SellAllHoldingsModal
        open={sellAllOpen}
        onClose={() => setSellAllOpen(false)}
        holdings={sellAllHoldingsInput}
        address={address}
        onSold={() => {
          if (address) void loadPortfolio(address);
          window.dispatchEvent(new Event("pump:activity"));
        }}
      />

      {quickTradeTarget ? (
        <TradeSheet
          key={`${quickTradeTarget.tokenAddress}-${quickTradeTarget.side}`}
          open
          presentation="modal"
          onClose={() => setQuickTradeTarget(null)}
          tokenAddress={quickTradeTarget.tokenAddress}
          symbol={quickTradeTarget.symbol}
          status=""
          prefill={{
            side: quickTradeTarget.side,
            ...(quickTradeTarget.side === "sell"
              ? { sellMax: true, autoSubmit: true }
              : { buyMax: true, autoSubmit: true }),
          }}
          onTradeConfirmed={() => {
            setQuickTradeTarget(null);
            if (address) void loadPortfolio(address);
            window.dispatchEvent(new Event("pump:activity"));
          }}
        />
      ) : null}

      <div className="space-y-3 md:space-y-4">
        <section className="panel-surface overflow-hidden bg-gradient-to-br from-pump-accent/10 via-pump-card to-pump-surface/60 p-4 md:p-5">
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
              <div className="skeleton-shimmer h-12 w-12 shrink-0 rounded-full md:h-14 md:w-14" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="financial-value text-body-sm font-semibold text-pump-text md:text-body">
                  {shortAddress(address)}
                </p>
                <button
                  type="button"
                  onClick={() => setAvatarPickerOpen(true)}
                  className="shrink-0 text-caption font-medium text-pump-accent hover:underline"
                >
                  Change avatar
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption md:mt-2 md:text-body-sm">
                <button
                  type="button"
                  onClick={() => {
                    setFollowModalTab("following");
                    setFollowModalOpen(true);
                  }}
                  className="financial-value font-semibold text-pump-text transition hover:text-pump-accent"
                >
                  {data.followingCount ?? 0} following
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
                  {data.followerCount ?? 0} followers
                </button>
              </div>
            </div>
          </div>

          <div className="portfolio-hero-metrics mt-3 grid grid-cols-2 items-stretch gap-2 md:mt-4 lg:grid-cols-4">
            <PortfolioStatBox
              label="Portfolio value"
              icon={MetricIcons.portfolioValue}
              value={
                <>
                  <span>{formatUsdReadable(totalEstimatedUsd, { compact: true })}</span>
                  <PctChange
                    value={portfolioValuePct}
                    className="text-caption font-medium"
                    toneClassName={pnlTone(portfolioValuePct ?? totalNetPnl)}
                  />
                </>
              }
              valueClassName={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 financial-value text-body-sm font-semibold text-pump-text ${flashText(totalValueFlash)}`}
            />
            <PortfolioStatBox
              label="Net PnL"
              icon={MetricIcons.netPnl}
              value={formatUsdReadable(totalNetPnlUsd, { compact: true, signed: true })}
              valueClassName={`financial-value text-body-sm font-semibold ${pnlTone(totalNetPnl)} ${flashText(totalPnlFlash)}`}
            />
            <CreatorFeesCard
              className="col-span-2 lg:col-span-1"
              totalBnb={creatorFeesTotalBnb}
              bnbUsd={bnbUsd}
              onOpenModal={() => setClaimOpen(true)}
            />
            {address ? (
              <ReferralRewardsCard
                className="col-span-2 lg:col-span-1"
                address={address}
                claimedBnb={referralStats?.claimedBnb ?? 0}
                pendingWei={pendingReferrerWei}
                bnbUsd={bnbUsd}
                onOpenModal={() => setReferrerClaimOpen(true)}
              />
            ) : null}
          </div>
        </section>

        {error ? <div className="notice-error p-4">{error}</div> : null}

        <PortfolioAirdropsSection address={address} />

        {data && !error ? (
          <>
            <div className="space-y-2 md:space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
                <h3 className="section-heading text-h3 inline-flex items-center gap-2">
                  <MetricIcons.holdings
                    className="hidden h-[1.05em] w-[1.05em] shrink-0 text-pump-accent sm:block"
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                  Holdings ({!holdingsReady && holdingsEnriching ? "…" : holdingsCount})
                </h3>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {dustHoldingsCount > 0 ? (
                    <button
                      type="button"
                      onClick={toggleShowDustHoldings}
                      className={
                        showDustHoldings ? "chip-button chip-button-active" : "chip-button"
                      }
                      aria-pressed={showDustHoldings}
                    >
                      {showDustHoldings
                        ? `Hide dust (<$${PORTFOLIO_DUST_MIN_VALUE_USD})`
                        : portfolioDustLabel(dustHoldingsCount)}
                    </button>
                  ) : null}
                  {holdingsCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSellAllOpen(true)}
                      className="secondary-button shrink-0 border-pump-danger/35 px-3 py-1.5 text-caption text-pump-danger hover:bg-pump-danger/10"
                    >
                      Sell all ({holdingsCount})
                    </button>
                  ) : null}
                </div>
              </div>
              {holdingsCount > 0 ? <HoldingsSwipeHint /> : null}
              {!holdingsReady && holdingsEnriching ? (
                <section className="panel-surface portfolio-section-surface p-4" aria-busy="true">
                  <p className="text-body-sm text-pump-muted">Loading holdings…</p>
                </section>
              ) : awaitingDustFilter ? (
                <section className="panel-surface portfolio-section-surface p-4" aria-busy="true">
                  <p className="text-body-sm text-pump-muted">Applying dust filter…</p>
                </section>
              ) : holdingsCount === 0 && totalHoldingsCount > 0 ? (
                <div className="panel-surface empty-state">
                  <p className="empty-state-copy">
                    No positions above ${PORTFOLIO_DUST_MIN_VALUE_USD}.{" "}
                    {dustHoldingsCount > 0 ? (
                      <button
                        type="button"
                        onClick={toggleShowDustHoldings}
                        className="font-medium text-pump-accent underline-offset-2 hover:underline"
                      >
                        {portfolioDustLabel(dustHoldingsCount)}
                      </button>
                    ) : null}
                  </p>
                </div>
              ) : holdingsCount === 0 ? (
                <div className="panel-surface empty-state">
                  <p className="empty-state-copy">No open positions. Buy from the Arena.</p>
                </div>
              ) : (
                <section className="panel-surface portfolio-section-surface">
                  <div className="lg:hidden divide-y divide-pump-border/10">
                    {visibleHoldingsRows.map((row, index) => {
                      if (row.kind === "wallet") {
                        return (
                          <WalletHoldingMobileRow
                            key={row.holding.tokenAddress}
                            holding={row.holding}
                            bnbUsd={bnbUsd}
                            peekOnMount={index === 0}
                            onBuyMax={() =>
                              openQuickTrade(row.holding.tokenAddress, row.holding.symbol, "buy")
                            }
                            onSellMax={() =>
                              openQuickTrade(row.holding.tokenAddress, row.holding.symbol, "sell")
                            }
                          />
                        );
                      }

                      const { position, balance, remainingCostBasis, avgEntry } = row.view;
                      const avgEntryUsd = avgEntry != null ? bnbToUsd(avgEntry, bnbUsd) : null;
                      const positionValueUsd = bnbToUsd(
                        balance * Number(position.lastPriceBnb),
                        bnbUsd
                      );
                      const openPnlBnb = holdingOpenPnlBnb(row.view);
                      const openPnlUsd = bnbUsd != null ? openPnlBnb * bnbUsd : null;
                      const openPnlPct =
                        remainingCostBasis > 0 ? (openPnlBnb / remainingCostBasis) * 100 : null;

                      return (
                        <HoldingSwipeRow
                          key={position.tokenAddress}
                          peekOnMount={index === 0}
                          onBuyMax={() => openQuickTrade(position.tokenAddress, position.symbol, "buy")}
                          onSellMax={() =>
                            openQuickTrade(position.tokenAddress, position.symbol, "sell")
                          }
                        >
                          <article className="grid grid-cols-[1.75rem_1fr_auto] gap-x-2 gap-y-2 p-2.5">
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
                              <PnlCell usd={openPnlUsd} pct={openPnlPct} />
                            </div>
                            <div className="col-span-2 col-start-2 flex w-full items-center justify-between gap-2 text-[11px] leading-tight">
                              <span className="financial-value min-w-0 truncate text-pump-text">
                                <span className="text-pump-muted">VAL </span>
                                <span
                                  className={flashText(
                                    holdingFlashes[position.tokenAddress.toLowerCase()]
                                  )}
                                >
                                  {formatUsdReadable(positionValueUsd, { compact: true })}
                                </span>
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
                        </HoldingSwipeRow>
                      );
                    })}
                  </div>

                  <div className="hidden lg:block overflow-x-auto">
                    <table className="sheet-grid portfolio-holdings-grid min-w-[820px]">
                      <thead>
                        <tr>
                          <th>Coin</th>
                          <th>Value</th>
                          <th>Balance</th>
                          <th>Entry</th>
                          <th className="w-[1%] whitespace-nowrap">P/L</th>
                          <th className="w-[1%] whitespace-nowrap text-right">Trade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleHoldingsRows.map((row) => {
                          if (row.kind === "wallet") {
                            return (
                              <WalletHoldingDesktopRow
                                key={row.holding.tokenAddress}
                                holding={row.holding}
                                bnbUsd={bnbUsd}
                                onBuyMax={() =>
                                  openQuickTrade(row.holding.tokenAddress, row.holding.symbol, "buy")
                                }
                                onSellMax={() =>
                                  openQuickTrade(row.holding.tokenAddress, row.holding.symbol, "sell")
                                }
                              />
                            );
                          }

                          const { position, balance, remainingCostBasis, avgEntry } = row.view;
                          const avgEntryUsd = avgEntry != null ? bnbToUsd(avgEntry, bnbUsd) : null;
                          const positionValueUsd = bnbToUsd(
                            balance * Number(position.lastPriceBnb),
                            bnbUsd
                          );
                          const openPnlBnb = holdingOpenPnlBnb(row.view);
                          const openPnlUsd = bnbUsd != null ? openPnlBnb * bnbUsd : null;
                          const openPnlPct =
                            remainingCostBasis > 0
                              ? (openPnlBnb / remainingCostBasis) * 100
                              : null;

                          return (
                            <tr key={position.tokenAddress} className="group">
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
                              <td className={`px-4 py-3 financial-value font-semibold text-pump-text ${flashText(holdingFlashes[position.tokenAddress.toLowerCase()])}`}>
                                {formatUsdReadable(positionValueUsd, { compact: true })}
                              </td>
                              <td className="px-4 py-3 financial-value text-pump-text">
                                {formatTokenBalance(balance)}
                              </td>
                              <td className="px-4 py-3 financial-value text-pump-text">
                                {formatUsdReadable(avgEntryUsd, { compact: true })}
                              </td>
                              <td className="w-[1%] whitespace-nowrap px-4 py-3">
                                <PnlCell usd={openPnlUsd} pct={openPnlPct} align="start" />
                              </td>
                              <td className="w-[1%] whitespace-nowrap px-4 py-3">
                                <HoldingQuickActions
                                  onBuyMax={() =>
                                    openQuickTrade(position.tokenAddress, position.symbol, "buy")
                                  }
                                  onSellMax={() =>
                                    openQuickTrade(position.tokenAddress, position.symbol, "sell")
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {hasMoreHoldings ? (
                    <div className="flex justify-center border-t border-pump-border/10 px-3 py-3">
                      <button
                        type="button"
                        className="text-body-sm font-medium text-pump-accent hover:underline"
                        onClick={() =>
                          setHoldingsVisibleLimit((prev) =>
                            Math.min(prev + PORTFOLIO_HOLDINGS_INCREMENT, holdingsCount)
                          )
                        }
                      >
                        {`Load more (${visibleHoldingsRows.length} of ${holdingsCount})`}
                      </button>
                    </div>
                  ) : null}
                </section>
              )}
            </div>

            <div className="space-y-2 md:space-y-3">
              <h3 className="section-heading text-h3 inline-flex items-center gap-2">
                <MetricIcons.launch
                  className="hidden h-[1.05em] w-[1.05em] shrink-0 text-pump-accent sm:block"
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
                Launched tokens ({data.createdTokensTotal})
              </h3>
              {data.createdTokens.length === 0 ? (
                <div className="panel-surface empty-state">
                  <p className="empty-state-copy">
                    No launched tokens yet.{" "}
                    <Link href="/create" className="text-pump-accent hover:underline">
                      Create one
                    </Link>
                  </p>
                </div>
              ) : (
                <section className="panel-surface portfolio-section-surface">
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
                            <span className="financial-value shrink-0 text-right">
                              <span className="text-pump-muted">24H </span>
                              <PctChange
                                value={token.change24hPct ?? null}
                                className="inline-flex"
                              />
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="hidden lg:block">
                    <TokenBoardTable tokens={data.createdTokens} bnbUsd={bnbUsd} variant="created" />
                  </div>
                  {data.createdTokens.length < data.createdTokensTotal ? (
                    <div className="flex justify-center border-t border-pump-border/10 px-3 py-3">
                      <button
                        type="button"
                        className="text-body-sm font-medium text-pump-accent hover:underline disabled:opacity-50"
                        onClick={() => void loadMoreCreatedTokens()}
                        disabled={loadingMoreCreated}
                      >
                        {loadingMoreCreated
                          ? "Loading…"
                          : `Load more (${data.createdTokens.length} of ${data.createdTokensTotal})`}
                      </button>
                    </div>
                  ) : null}
                </section>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

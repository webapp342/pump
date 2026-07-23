"use client";

import {
  PumpIcon,
  faCampaign,
  faCheck,
  faCopy,
  faExternalLink,
  faGreenEnergy,
  faShare,
} from "@/lib/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { parseUnits, type Address } from "viem";
import { parseUnitsDecimal } from "@/lib/viem-decimal";
import { useReadContract } from "wagmi";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import type { TokenHolderSnapshot, TokenDetail, TradeItem } from "@/lib/db/launchpad";
import {
  BONDING_TOKEN_SUPPLY_HUMAN,
  bondingCurveManagerAbi,
  bondingCurveSnapshotFromTuple,
} from "@/lib/bonding-curve";
import {
  resolveLatestSpotPriceBnb,
  sortTradesChronologically,
  synthesizeCandleUpdatesFromSpot,
  type CandleWsUpdate,
} from "@/lib/candles";
import { PumpSubscriptPrice } from "@/components/ui/PumpSubscriptPrice";
import { mergeWsCandleUpdates } from "@/lib/chart-series-state";
import { logChartWsMerge } from "@/lib/chart-observability";
import type { InitialChartCandles } from "@/lib/token-server";
import { buildTokenMarketSnapshot } from "@/lib/token-market-snapshot";
import {
  bnbToUsd,
  tokenPriceUsd,
} from "@/lib/format-usd";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { resolveDisplayNativeUsd, latestNativeUsdFromTrades } from "@/lib/native-usd-price";
import {
  tokenFromCurve,
  type CurveTuple,
} from "@/lib/launchpad-events";
import {
  MISSION_KEYS,
  listRecentOptimisticActivities,
  pushOptimisticActivity,
  removeOptimisticActivities,
} from "@/lib/optimistic-activity";
import { contracts, explorerAddressUrl, pumpChain, shortAddress } from "@/config/chain";
import {
  normalizeRouteAddressKey,
  routeAddressKeysEqual,
  txHashKey,
} from "@/lib/address";
import { isSolanaChainFamily } from "@/config/chain-family";
import { PUMP_FEEL_DEFAULTS } from "@/config/solana";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { useSolanaTradeMarket } from "@/hooks/useSolanaTradeMarket";
import { solanaBondingStateFromLive } from "@/lib/solana/bonding-live";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { TradePanel, type TradeConfirmedPayload, type TradeOptimisticPayload, type TradeSubmittedPayload } from "@/components/token/TradePanel";
import { QuickTradeConfirmModal } from "@/components/token/QuickTradeConfirmModal";
import { TradeSheet } from "@/components/token/TradeSheet";
import { TokenMobileHero } from "@/components/token/TokenMobileHero";
import { useRegisterTokenMobileTradeDock } from "@/components/token/TokenMobileTradeDockContext";
import {
  buildTokenMobileQuickTradePrefill,
  buildTokenMobileTradeEditPrefill,
  readTokenMobileTradeSide,
  writeTokenMobileTradeSide,
} from "@/lib/token-mobile-trade-prefs";
import {
  parseTradePrefillFromSearchParams,
  type TradePrefillConfig,
} from "@/lib/token-trade-prefill";
import { TradeTape } from "@/components/token/TradeTape";
import { TokenWatchlistStrip } from "@/components/token/TokenFavoritesStrip";
import { TokenMarketSidebar } from "@/components/token/TokenMarketSidebar";
import { PriceChart } from "@/components/token/PriceChart";
import { FavoriteIcon } from "@/components/icons/FavoriteIcon";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TokenAnnouncementsPanel } from "@/components/token/TokenAnnouncementsPanel";
import {
  AnnounceCalloutSheet,
  type AnnounceCalloutPhase,
} from "@/components/token/AnnounceCalloutSheet";
import { CreatorProfileModal } from "@/components/creators/CreatorProfileModal";
import { CreatorRewardsCard } from "@/components/creators/CreatorRewardsCard";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { TokenSocialLinksBar } from "@/components/token/TokenSocialLinksBar";
import { hasSocialLinks } from "@/lib/token-social";
import { formatAge, isTokenAgeUnder1h } from "@/lib/arena-board-format";
import { tokenSharePayload } from "@/lib/share-links";
import { tokenDocumentTitle } from "@/lib/token-tab-title";
import { writeLastTradeTokenAddress } from "@/lib/last-trade-token";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";
import { useRafMessageQueue } from "@/hooks/useRafMessageQueue";
import { useTokenChartTapeSplit } from "@/hooks/useTokenChartTapeSplit";
import { useBondingCurveMachine } from "@/hooks/useBondingCurveMachine";
import {
  isUninitializedCurveTuple,
} from "@/lib/bonding-curve-state";
import {
  patchTokenDetailFromWsTrade,
  prependTradeIfNew,
  wsPayloadToTradeItem,
  type TokenTradeWsPayload,
} from "@/lib/token-live-delta";
import { hapticTap } from "@/lib/haptic";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { scheduleTradeWalletBalanceRefresh } from "@/lib/trade-balance-refresh";

const CHAIN_LIVE_POLL_MS = 2_000;
const BURST_POLL_MS = 1_500;
const BURST_DURATION_MS = 60_000;

function formatToolbarUsdAmount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatToolbarChangePctOnly(change: PriceChange24h | null): string {
  if (!change) return "—";
  const pct = change.changePct;
  return `${pct >= 0 && pct !== 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function changeToneClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "token-detail-toolbar__stat-value--up" : "token-detail-toolbar__stat-value--down";
}

type TokenDetailLiveProps = {
  tokenAddress: string;
  symbol: string;
  status: string;
  initialToken: TokenDetail;
  initialTrades: TradeItem[];
  initialHolders?: TokenHolderSnapshot[];
  initialCandles?: InitialChartCandles;
  /** Bundle matches routed token address — safe to trade. */
  contentSynced?: boolean;
  /** Background fetch or pair switch in progress. */
  isRefreshing?: boolean;
};

type PriceChange24h = {
  changeBnb: number;
  changePct: number;
  changeUsd: number | null;
};

function tradeVolumeBnb(trade: TradeItem): number {
  if (trade.netBnb != null) return Math.max(0, Number(trade.netBnb));
  const gross = Number(trade.nativeAmount);
  const fee = Number(trade.feeBnb ?? 0);
  return Math.max(0, gross - fee);
}

function compute24hPriceChange(
  trades: TradeItem[],
  currentPriceBnb: number,
  bnbUsd: number | null | undefined
): PriceChange24h | null {
  if (!Number.isFinite(currentPriceBnb) || currentPriceBnb <= 0) return null;

  const priced = trades
    .filter((t) => Number(t.priceBnb) > 0)
    .sort((a, b) => new Date(a.blockTime).getTime() - new Date(b.blockTime).getTime());

  if (priced.length === 0) return null;

  const cutoff = Date.now() - 86_400_000;
  let referencePrice = Number(priced[0]!.priceBnb);

  for (const trade of priced) {
    if (new Date(trade.blockTime).getTime() <= cutoff) {
      referencePrice = Number(trade.priceBnb);
    }
  }

  if (referencePrice <= 0) return null;

  const changeBnb = currentPriceBnb - referencePrice;
  const changePct = (changeBnb / referencePrice) * 100;
  const changeUsd =
    bnbUsd != null && Number.isFinite(bnbUsd) ? changeBnb * bnbUsd : null;

  return { changeBnb, changePct, changeUsd };
}

function computeVolumeWindowBnb(trades: TradeItem[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return trades.reduce((sum, trade) => {
    const tradeMs = new Date(trade.blockTime).getTime();
    return tradeMs >= cutoff ? sum + tradeVolumeBnb(trade) : sum;
  }, 0);
}

/** Prefer on-chain curve + live tape when indexer lags behind confirmed trades. */
function mergeLiveStats(
  base: TokenDetail,
  chainCurve: CurveTuple | undefined,
  liveTrades: TradeItem[]
): TokenDetail {
  // Solana pump-feel tuples keep reserveZug/soldTokens at 0 (virtuals fold real).
  // tokenFromCurve would zero reserveBnb and poison the local curve machine.
  const pumpFeelCurve =
    chainCurve != null &&
    chainCurve[2] === 0n &&
    chainCurve[3] === 0n &&
    chainCurve[5] > 0n &&
    chainCurve[6] > 0n;
  let merged =
    chainCurve && !pumpFeelCurve ? tokenFromCurve(base, chainCurve) : base;

  if (liveTrades.length > 0) {
    const chronological = sortTradesChronologically(liveTrades);
    const last = chronological[chronological.length - 1]!;
    // Only trust indexed/WS/optimistic bonding mark — never EVM virtual-reserve replay
    // (Solana pump-feel virtuals ≠ DEFAULT_VIRTUAL_* and would collapse MCAP ~10×).
    const indexedSpot = Number(last.spotPriceBnb);
    const spotPrice =
      Number.isFinite(indexedSpot) && indexedSpot > 0
        ? indexedSpot
        : resolveLatestSpotPriceBnb(chronological);
    const baseSpot = Number(merged.lastPriceBnb);
    const nextSpot =
      spotPrice != null && spotPrice > 0
        ? spotPrice
        : Number.isFinite(baseSpot) && baseSpot > 0
          ? baseSpot
          : null;

    merged = {
      ...merged,
      tradeCount: Math.max(merged.tradeCount, chronological.length),
      lastPriceBnb:
        nextSpot != null && nextSpot > 0
          ? String(nextSpot)
          : merged.lastPriceBnb,
      marketCapBnb:
        nextSpot != null && nextSpot > 0
          ? String(nextSpot * BONDING_TOKEN_SUPPLY_HUMAN)
          : merged.marketCapBnb,
    };
  }

  return merged;
}

export function TokenDetailLive({
  tokenAddress,
  symbol,
  status,
  initialToken,
  initialTrades,
  initialHolders = [],
  initialCandles,
  contentSynced = true,
  isRefreshing = false,
}: TokenDetailLiveProps) {
  const [token, setToken] = useState(initialToken);
  const [dbTrades, setDbTrades] = useState(initialTrades);
  const [liveCandleUpdates, setLiveCandleUpdates] = useState<CandleWsUpdate[]>([]);
  const [holdersRefreshKey, setHoldersRefreshKey] = useState(0);
  const [indexerSyncing, setIndexerSyncing] = useState(false);
  const [latestWsBonding, setLatestWsBonding] = useState<
    TokenTradeWsPayload["bonding"] | null
  >(null);
  const [chartCurrency, setChartCurrency] = useState<"usd" | "mcap">("mcap");
  const chartTapeSplit = useTokenChartTapeSplit();

  const streamAddress = token.address || tokenAddress;

  useEffect(() => {
    writeLastTradeTokenAddress(tokenAddress);
  }, [tokenAddress]);

  useEffect(() => {
    setLiveCandleUpdates([]);
  }, [streamAddress]);

  useEffect(() => {
    if (!contentSynced) return;
    setToken(initialToken);
    setDbTrades(initialTrades);
    setIndexerSyncing(false);
    setLatestWsBonding(null);
    hydratedRef.current = false;
  }, [contentSynced, tokenAddress, initialToken, initialTrades]);

  const [copiedAddress, setCopiedAddress] = useState(false);
  const [profileAddress, setProfileAddress] = useState<string | null>(null);
  const [tradePrefill, setTradePrefill] = useState<TradePrefillConfig | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [quickTradeRun, setQuickTradeRun] = useState<{
    key: string;
    prefill: TradePrefillConfig;
  } | null>(null);
  const [, setAgeTick] = useState(0);
  const tradePrefillCapturedRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address, isConnected } = useActiveWalletAddress();
  const { solanaAddress } = usePumpWallet();
  const isSolanaLive = isSolanaChainFamily;

  const solanaMarket = useSolanaTradeMarket(
    isSolanaLive ? streamAddress : undefined,
    isSolanaLive ? solanaAddress : undefined,
    isSolanaLive,
    { fetchCurve: false }
  );
  const { openConnectModal } = useOpenConnectModal();
  const queryClient = useQueryClient();
  const { bnbUsd } = useBnbUsdPrice();
  const { isFavorite, toggleFavorite, upsertFavoriteSnapshots } = useFavorites();
  const [announceBusy, setAnnounceBusy] = useState(false);
  const [announceSheetOpen, setAnnounceSheetOpen] = useState(false);
  const [announcePhase, setAnnouncePhase] = useState<AnnounceCalloutPhase>("confirm");
  const [announceError, setAnnounceError] = useState<string | null>(null);
  const [announceSuccessX, setAnnounceSuccessX] = useState<number | null>(null);
  const [announceMessage, setAnnounceMessage] = useState("");
  const [announcementsRefreshKey, setAnnouncementsRefreshKey] = useState(0);

  const burstUntilRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  /** Set when hidden quick-trade UserOp is submitted — prevents 5s fallback sheet. */
  const quickTradeDispatchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (tradePrefillCapturedRef.current) return;
    const parsed = parseTradePrefillFromSearchParams(searchParams);
    if (!parsed) return;

    tradePrefillCapturedRef.current = true;
    router.replace(`/token/${tokenAddress}`, { scroll: false });

    if (parsed.autoSubmit) {
      const { autoSubmit: _auto, ...prefill } = parsed;
      setQuickTradeRun({
        key: `url-${prefill.side}-${Date.now()}`,
        prefill,
      });
      return;
    }

    setTradePrefill(parsed);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setTradeSheetOpen(true);
    }
  }, [searchParams, router, tokenAddress]);

  /** Chart + tape: indexed/WS only — no trader-only optimistic layer. */
  const trades = dbTrades;
  const chartFallbackTrades = dbTrades;
  const hasLivePending = indexerSyncing;
  const tradeLocked = !contentSynced;
  const announceButtonDisabled = tradeLocked || announceBusy;

  const { data: evmChainCurve, refetch: refetchEvmCurve } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "curves",
    args: [streamAddress as `0x${string}`],
    chainId: pumpChain.id,
    query: {
      enabled: !isSolanaLive,
      refetchInterval: hasLivePending ? BURST_POLL_MS : CHAIN_LIVE_POLL_MS,
      staleTime: 0,
    },
  });

  const solanaLiveBonding = useMemo(() => {
    if (!isSolanaLive) return null;
    const graduated =
      token.status === "GRADUATED" ||
      token.progressBps >= 10000 ||
      latestWsBonding?.graduated === true ||
      latestWsBonding?.curveComplete === true;
    return solanaBondingStateFromLive({
      reserveBnb: token.reserveBnb,
      tokenSold: token.tokenSold ?? "0",
      progressBps: latestWsBonding?.progressBps ?? token.progressBps,
      status: graduated ? "GRADUATED" : token.status,
      vaultTokenReserve: latestWsBonding?.vaultTokenReserve ?? null,
      curveComplete: graduated,
    });
  }, [isSolanaLive, token, latestWsBonding]);

  const chainCurve = useMemo((): CurveTuple | undefined => {
    if (isSolanaLive) {
      const curve = solanaLiveBonding;
      if (!curve) return undefined;
      return [
        streamAddress as Address,
        (token.creatorAddress ?? streamAddress) as Address,
        curve.reserveZug,
        curve.soldTokens,
        parseUnitsDecimal(token.targetBnb ?? "0", 18),
        curve.virtualZugReserve,
        curve.virtualTokenReserve,
        solanaMarket.paused,
      ] as CurveTuple;
    }
    return evmChainCurve as CurveTuple | undefined;
  }, [
    isSolanaLive,
    solanaLiveBonding,
    solanaMarket.paused,
    evmChainCurve,
    streamAddress,
    token.creatorAddress,
    token.targetBnb,
  ]);

  const refetchCurve = useCallback(async () => {
    if (isSolanaLive) {
      await solanaMarket.refetchBalances();
      return;
    }
    await refetchEvmCurve();
  }, [isSolanaLive, solanaMarket, refetchEvmCurve]);

  const liveToken = useMemo(
    () => mergeLiveStats(token, chainCurve as CurveTuple | undefined, trades),
    [token, chainCurve, trades]
  );

  const chainCurveSnapshot = useMemo(() => {
    if (!chainCurve) return undefined;
    const tuple = chainCurve as CurveTuple;
    if (isUninitializedCurveTuple(tuple)) return undefined;
    return bondingCurveSnapshotFromTuple(tuple);
  }, [chainCurve]);

  const liveCurveSnapshot = useBondingCurveMachine({
    reserveBnb: token.reserveBnb,
    tokenSold: token.tokenSold ?? "0",
    paused: token.status === "PAUSED",
    chainCurve: chainCurve as CurveTuple | undefined,
    wsBonding: latestWsBonding,
  });

  const tradeCurveSnapshot = liveCurveSnapshot ?? chainCurveSnapshot;

  /** Sell-all quote for holder P/L — Solana uses WS/DB bonding snapshot (no curve RPC). */
  const holderCurveSnapshot = useMemo(() => {
    if (!tradeCurveSnapshot) return null;
    if (!isSolanaLive) return tradeCurveSnapshot;
    const curve = solanaLiveBonding;
    if (!curve) return tradeCurveSnapshot;
    return {
      ...tradeCurveSnapshot,
      reserveZug: "0",
      soldTokens: "0",
      realTokenReserves: curve.realTokenReserves?.toString(),
      realSolReserves: curve.realSolReserves?.toString(),
      complete: curve.complete,
      vaultTokenReserves: curve.vaultTokenReserves?.toString(),
    };
  }, [tradeCurveSnapshot, isSolanaLive, solanaLiveBonding]);

  const holderProtocolFeeBps = isSolanaLive
    ? (solanaMarket.protocolFeeBps ?? BigInt(PUMP_FEEL_DEFAULTS.protocolFeeBps))
    : 100n;

  const marketSnapshot = useMemo(
    () => buildTokenMarketSnapshot(liveToken),
    [liveToken]
  );

  const displayPrice = marketSnapshot.spotPriceBnb;
  const liveMarketCapNative = marketSnapshot.marketCapBnb;

  const fetchLive = useCallback(async () => {
    try {
      const response = await fetch(`/api/tokens/${streamAddress}`, { cache: "no-store" });
      const body = (await response.json()) as {
        data?: { token: TokenDetail; trades: TradeItem[] };
      };

      if (!response.ok || !body.data) return;

      removeOptimisticActivities(body.data.trades.map((t) => t.txHash));

      setDbTrades(body.data.trades);
      setToken(body.data.token);
      setIndexerSyncing(false);
    } catch {
      // Keep last good snapshot on transient errors.
    }
  }, [streamAddress]);

  const fetchLiveRef = useRef(fetchLive);
  fetchLiveRef.current = fetchLive;

  const lastWsSeqRef = useRef(0);

  const applyWsMessages = useCallback((messages: unknown[]) => {
    for (const message of messages) {
      const payload = message as TokenTradeWsPayload & { seq?: number };
      if (payload.seq != null && payload.seq <= lastWsSeqRef.current) continue;
      if (payload.seq != null) lastWsSeqRef.current = payload.seq;

      if (payload.type === "trade") {
        const tradeItem = wsPayloadToTradeItem(payload);
        if (tradeItem) {
          if (payload.bonding) {
            setLatestWsBonding(payload.bonding);
          }
          setDbTrades((prev) => prependTradeIfNew(prev, tradeItem));
          let updates = (payload.candleUpdates ?? []) as CandleWsUpdate[];
          // Indexer normally sends candleUpdates (Redis hot SSOT). Fallback only when omitted.
          if (updates.length === 0) {
            const spotAfter = payload.bonding
              ? Number(
                  payload.bonding.spotPriceZug ?? payload.bonding.lastPriceZug ?? 0
                )
              : Number(tradeItem.spotPriceBnb ?? 0);
            const gross = Number(tradeItem.nativeAmount);
            const fee = Number(tradeItem.feeBnb ?? 0);
            const volumeNative = Math.max(0, gross - fee);
            updates = synthesizeCandleUpdatesFromSpot({
              spotAfter,
              volumeNative,
              isBuy: tradeItem.side === "BUY",
              blockTimeMs: new Date(tradeItem.blockTime).getTime(),
            });
          }
          if (updates.length > 0) {
            setLiveCandleUpdates((prev) => mergeWsCandleUpdates(prev, updates));
            for (const update of updates) {
              logChartWsMerge({
                tokenAddress: streamAddress,
                interval: update.interval,
                updateCount: updates.length,
                isNewBucket: update.isNewBucket,
              });
            }
            setIndexerSyncing(false);
          }
          setToken((prev) => patchTokenDetailFromWsTrade(prev, payload) ?? prev);
          setHoldersRefreshKey((k) => k + 1);
        }
        continue;
      }

      if (payload.type === "board_delta") {
        void fetchLiveRef.current();
      }
    }
  }, [streamAddress]);

  const queueWsMessage = useRafMessageQueue(applyWsMessages);

  const { connected: wsConnected } = useLiveChannel({
    room: `token:${normalizeRouteAddressKey(streamAddress)}`,
    onMessage: (message) => {
      queueWsMessage(message);
    },
  });

  const liveVaultTokenReserve = latestWsBonding?.vaultTokenReserve ?? null;
  const liveGraduated =
    liveToken.status === "GRADUATED" ||
    liveToken.progressBps >= 10000 ||
    latestWsBonding?.graduated === true ||
    latestWsBonding?.curveComplete === true;

  const solanaTradeLiveProps = isSolanaLive
    ? {
        progressBps: liveToken.progressBps,
        graduated: liveGraduated,
        vaultTokenReserve: liveVaultTokenReserve,
        wsConnected,
      }
    : {};

  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    const delay = resolveLivePollDelay(
      wsConnected,
      hasLivePending,
      burstUntilRef.current
    );
    pollTimerRef.current = setTimeout(async () => {
      await fetchLive();
      schedulePoll();
    }, delay);
  }, [fetchLive, wsConnected, hasLivePending]);

  useEffect(() => {
    schedulePoll();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [schedulePoll]);

  /** Burst poll after local trade — chart/tape wait for indexer/WS like everyone else. */
  const handleTradeOptimistic = useCallback(
    (_payload: TradeOptimisticPayload) => {
      burstUntilRef.current = Date.now() + BURST_DURATION_MS;
      setIndexerSyncing(true);
      void refetchCurve();
    },
    [refetchCurve]
  );

  const handleTradeOptimisticRollback = useCallback(
    (_payload: { pendingId: string }) => {
      setIndexerSyncing(false);
      void refetchCurve();
      void fetchLive();
    },
    [fetchLive, refetchCurve]
  );

  const handleTradeSubmitted = useCallback(
    (_payload: TradeSubmittedPayload) => {
      burstUntilRef.current = Date.now() + BURST_DURATION_MS;
      setIndexerSyncing(true);
      void fetchLive();
    },
    [fetchLive]
  );

  const handleTradeConfirmed = useCallback(
    async (payload: TradeConfirmedPayload) => {
      burstUntilRef.current = Date.now() + BURST_DURATION_MS;
      setIndexerSyncing(true);

      pushOptimisticActivity({
        txHash: payload.txHash,
        type: payload.side,
        at: new Date().toISOString(),
        tokenAddress: streamAddress,
        missionKeys: [MISSION_KEYS.dailySwap],
      });

      if (address && !isSolanaLive) {
        scheduleTradeWalletBalanceRefresh(queryClient, {
          address: address as Address,
          tokenAddress: streamAddress as Address,
        });
      }

      void refetchCurve();
      void fetchLive();
    },
    [address, fetchLive, isSolanaLive, queryClient, refetchCurve, streamAddress]
  );

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (initialTrades.length > 0) {
      removeOptimisticActivities(initialTrades.map((t) => t.txHash));
    }

    const knownHashes = new Set(
      initialTrades.map((t) => txHashKey(t.txHash))
    );

    const pending = listRecentOptimisticActivities().filter(
      (activity) =>
        activity.tokenAddress != null &&
        routeAddressKeysEqual(activity.tokenAddress, streamAddress) &&
        (activity.type === "create" || activity.type === "buy" || activity.type === "sell") &&
        !knownHashes.has(txHashKey(activity.txHash))
    );

    if (pending.length === 0) return;

    burstUntilRef.current = Date.now() + BURST_DURATION_MS;
    setIndexerSyncing(true);
    void fetchLive();
  }, [fetchLive, initialTrades, streamAddress]);

  const seededNativeUsd = useMemo(
    () => latestNativeUsdFromTrades(trades),
    [trades]
  );
  const effectiveBnbUsd = resolveDisplayNativeUsd(bnbUsd, seededNativeUsd);

  const priceUsd = tokenPriceUsd(displayPrice, effectiveBnbUsd);
  const fdvUsd = bnbToUsd(liveMarketCapNative, effectiveBnbUsd);

  useEffect(() => {
    if (!contentSynced) return;
    document.title = tokenDocumentTitle(liveToken.symbol, priceUsd);
  }, [contentSynced, liveToken.symbol, priceUsd]);

  const volume24hBnb = useMemo(() => {
    const fromTape = computeVolumeWindowBnb(trades, 86_400_000);
    const fromToken = Number(liveToken.volume24hBnb ?? 0);
    return Math.max(fromTape, fromToken);
  }, [trades, liveToken.volume24hBnb]);

  const change24h = useMemo(() => {
    const computed = compute24hPriceChange(trades, displayPrice, effectiveBnbUsd);
    if (computed) return computed;
    const pct = liveToken.change24hPct;
    if (pct == null || !Number.isFinite(pct)) return null;
    const referencePrice =
      displayPrice > 0 ? displayPrice / (1 + pct / 100) : null;
    if (referencePrice == null || referencePrice <= 0) return null;
    const changeBnb = displayPrice - referencePrice;
    return {
      changeBnb,
      changePct: pct,
      changeUsd: effectiveBnbUsd != null ? changeBnb * effectiveBnbUsd : null,
    };
  }, [trades, displayPrice, effectiveBnbUsd, liveToken.change24hPct]);

  const volume24hUsd = bnbToUsd(volume24hBnb, effectiveBnbUsd);
  const changeTone = change24h?.changePct ?? null;
  const showSocialLinks = hasSocialLinks(liveToken.socialLinks);

  const sharePayload = useMemo(
    () => tokenSharePayload(liveToken),
    [liveToken]
  );

  async function onCopyAddress() {
    const ok = await copyToClipboard(liveToken.address);
    setCopiedAddress(ok);
    if (ok) setTimeout(() => setCopiedAddress(false), 2000);
  }

  const favorited = isFavorite(streamAddress);

  const openAnnounceSheet = useCallback(() => {
    hapticTap();
    if (!isConnected || !address) {
      openConnectModal();
      return;
    }
    if (tradeLocked) return;
    setAnnounceError(null);
    setAnnounceSuccessX(null);
    setAnnounceMessage("");
    setAnnouncePhase("confirm");
    setAnnounceSheetOpen(true);
  }, [address, isConnected, openConnectModal, tradeLocked]);

  const closeAnnounceSheet = useCallback(() => {
    if (announceBusy) return;
    setAnnounceSheetOpen(false);
    setAnnouncePhase("confirm");
    setAnnounceError(null);
    setAnnounceSuccessX(null);
    setAnnounceMessage("");
  }, [announceBusy]);

  const confirmAnnounce = useCallback(async () => {
    if (!isConnected || !address) {
      openConnectModal();
      return;
    }
    if (announceBusy || tradeLocked) return;

    setAnnounceBusy(true);
    setAnnouncePhase("submitting");
    setAnnounceError(null);
    try {
      const response = await fetch("/api/tokens/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          tokenAddress: streamAddress,
          message: announceMessage,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        data?: { announcement?: { multiplierX?: number } };
      };
      if (!response.ok) {
        setAnnounceError(body.error ?? "Could not announce this token.");
        setAnnouncePhase("error");
        return;
      }
      const x = body.data?.announcement?.multiplierX;
      setAnnounceSuccessX(x != null && Number.isFinite(x) ? x : null);
      setAnnouncePhase("success");
      setAnnouncementsRefreshKey((key) => key + 1);
    } catch {
      setAnnounceError("Network error. Try again.");
      setAnnouncePhase("error");
    } finally {
      setAnnounceBusy(false);
    }
  }, [
    address,
    announceBusy,
    announceMessage,
    isConnected,
    openConnectModal,
    streamAddress,
    tradeLocked,
  ]);

  useEffect(() => {
    if (!isFavorite(streamAddress)) return;
    upsertFavoriteSnapshots([liveToken]);
  }, [isFavorite, streamAddress, liveToken, upsertFavoriteSnapshots]);

  const tradeTapeProps = {
    tokenAddress: streamAddress,
    creatorAddress: liveToken.creatorAddress,
    symbol: liveToken.symbol,
    logoUrl: liveToken.logoUrl,
    headTrades: trades,
    wsConnected,
    holdersRefreshKey,
    initialHolders,
    currentPriceBnb: displayPrice,
    currentMarketCapBnb: liveMarketCapNative,
    bnbUsd: effectiveBnbUsd,
    curveSnapshot: holderCurveSnapshot,
    protocolFeeBps: holderProtocolFeeBps,
    onAddressClick: setProfileAddress,
    creatorDisplayUsername: liveToken.creatorDisplayUsername,
    launchTxHash: liveToken.launchTxHash,
    followerCount: liveToken.creatorFollowerCount,
    tokenDescription: liveToken.description,
    announcementsRefreshKey,
  };

  useEffect(() => {
    const timer = setInterval(() => setAgeTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setTradeSheetOpen(false);
    setTradePrefill(null);
  }, [tokenAddress]);

  const closeTradeSheet = useCallback(() => {
    setTradeSheetOpen(false);
    setTradePrefill(null);
  }, []);

  const clearQuickTradeRun = useCallback(() => {
    quickTradeDispatchedKeyRef.current = null;
    setQuickTradeRun(null);
  }, []);

  const handleQuickTradeRunnerSubmitted = useCallback(
    (payload: TradeSubmittedPayload) => {
      quickTradeDispatchedKeyRef.current = quickTradeRun?.key ?? null;
      handleTradeSubmitted(payload);
    },
    [quickTradeRun, handleTradeSubmitted]
  );

  const executeQuickTrade = useCallback(
    (side: "buy" | "sell") => {
      hapticTap();
      writeTokenMobileTradeSide(side);
      if (tradeLocked) {
        setTradePrefill(buildTokenMobileTradeEditPrefill(side));
        setTradeSheetOpen(true);
        return;
      }
      if (!isConnected) {
        setTradePrefill(buildTokenMobileTradeEditPrefill(side));
        setTradeSheetOpen(true);
        return;
      }
      quickTradeDispatchedKeyRef.current = null;
      setQuickTradeRun({
        key: `${side}-${Date.now()}`,
        prefill: buildTokenMobileQuickTradePrefill(side),
      });
    },
    [isConnected, tradeLocked]
  );

  const openMobileTradeEdit = useCallback(() => {
    if (tradeLocked) return;
    hapticTap(6);
    setTradePrefill(buildTokenMobileTradeEditPrefill());
    setTradeSheetOpen(true);
  }, [tradeLocked]);

  const handleQuickSubmitBlocked = useCallback(() => {
    const side = quickTradeRun?.prefill.side ?? readTokenMobileTradeSide();
    clearQuickTradeRun();
    setTradePrefill(buildTokenMobileTradeEditPrefill(side));
    setTradeSheetOpen(true);
  }, [quickTradeRun, clearQuickTradeRun]);

  useEffect(() => {
    if (!quickTradeRun) return;
    const { key, prefill } = quickTradeRun;
    const timer = window.setTimeout(() => {
      setQuickTradeRun((current) => {
        if (current?.key !== key) return current;
        if (quickTradeDispatchedKeyRef.current === key) return current;
        setTradePrefill({ ...prefill, autoSubmit: false });
        setTradeSheetOpen(true);
        return null;
      });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [quickTradeRun]);

  const handleQuickTradeRunnerConfirmed = useCallback(
    async (payload: TradeConfirmedPayload) => {
      clearQuickTradeRun();
      await handleTradeConfirmed(payload);
    },
    [clearQuickTradeRun, handleTradeConfirmed]
  );

  const handleQuickTradeOptimisticRollback = useCallback(
    (payload: { pendingId: string }) => {
      clearQuickTradeRun();
      handleTradeOptimisticRollback(payload);
    },
    [clearQuickTradeRun, handleTradeOptimisticRollback]
  );

  const handleMobileTradeConfirmed = useCallback(
    async (payload: TradeConfirmedPayload) => {
      await handleTradeConfirmed(payload);
      setTradeSheetOpen(false);
      setTradePrefill(null);
    },
    [handleTradeConfirmed]
  );

  const mobileTradeDock = useMemo(
    () => ({
      disabled: tradeLocked,
      pendingSide: quickTradeRun?.prefill.side ?? null,
      onBuy: () => executeQuickTrade("buy"),
      onSell: () => executeQuickTrade("sell"),
      onEditAmount: openMobileTradeEdit,
    }),
    [tradeLocked, quickTradeRun?.prefill.side, executeQuickTrade, openMobileTradeEdit]
  );

  useRegisterTokenMobileTradeDock(mobileTradeDock);

  const tokenToolbar = (
    <div
      className={`token-detail-toolbar panel-surface ${
        isRefreshing ? "token-detail-toolbar--refreshing" : ""
      }`}
    >
      <h1 className="sr-only">
        {liveToken.name} ({liveToken.symbol})
      </h1>
      <div className="token-detail-toolbar__row">
        <div className="token-detail-toolbar__identity">
          <TokenAvatar
            address={liveToken.address}
            symbol={liveToken.symbol}
            logoUrl={liveToken.logoUrl}
            className="token-detail-toolbar__logo shrink-0 !ring-0"
          />
          <div className="token-detail-toolbar__pair-meta">
            <div className="token-detail-toolbar__symbol-row">
              <span className="token-detail-toolbar__symbol financial-value">
                {liveToken.symbol}
              </span>
            </div>
            <span
              className={`token-detail-toolbar__age${
                isTokenAgeUnder1h(liveToken.createdAt) ? " token-detail-toolbar__age--fresh" : ""
              }`}
            >
              <PumpIcon icon={faGreenEnergy} className="token-detail-toolbar__age-icon" aria-hidden />
              <span className="financial-value">{formatAge(liveToken.createdAt)}</span>
            </span>
          </div>
        </div>

        <div className="token-detail-toolbar__scroll">
          <div className="token-detail-toolbar__stats">
            <div className="token-detail-toolbar__stat">
              <span className="token-detail-toolbar__stat-label">Last price (24h)</span>
              <span className="token-detail-toolbar__stat-value token-detail-toolbar__price-line financial-value">
                <span className="token-detail-toolbar__price-amount">
                  {priceUsd != null && Number.isFinite(priceUsd) && priceUsd >= 1 ? (
                    priceUsd.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })
                  ) : (
                    <PumpSubscriptPrice value={priceUsd} />
                  )}
                </span>
                <span className={changeToneClass(changeTone)}>
                  {formatToolbarChangePctOnly(change24h)}
                </span>
              </span>
            </div>

            <div className="token-detail-toolbar__stat">
              <span className="token-detail-toolbar__stat-label">24h Volume</span>
              <span className="token-detail-toolbar__stat-value financial-value">
                {formatToolbarUsdAmount(volume24hUsd)}
              </span>
            </div>

            <div className="token-detail-toolbar__stat">
              <span className="token-detail-toolbar__stat-label">Market Cap</span>
              <span className="token-detail-toolbar__stat-value financial-value">
                {formatToolbarUsdAmount(fdvUsd)}
              </span>
            </div>

            <div className="token-detail-toolbar__stat">
              <span className="token-detail-toolbar__stat-label">Contract</span>
              <div className="token-detail-toolbar__contract">
                <span className="token-detail-toolbar__stat-value financial-value">
                  {shortAddress(liveToken.address, true)}
                </span>
                <a
                  href={explorerAddressUrl(liveToken.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="token-detail-toolbar__contract-btn"
                  aria-label="View contract on explorer"
                >
                  <PumpIcon icon={faExternalLink} size="xs" />
                </a>
                <button
                  type="button"
                  onClick={() => void onCopyAddress()}
                  className="token-detail-toolbar__contract-btn"
                  aria-label={copiedAddress ? "Address copied" : "Copy contract address"}
                >
                  {copiedAddress ? (
                    <PumpIcon icon={faCheck} size="xs" />
                  ) : (
                    <PumpIcon icon={faCopy} size="xs" />
                  )}
                </button>
              </div>
            </div>

            {showSocialLinks ? (
              <div className="token-detail-toolbar__stat">
                <span className="token-detail-toolbar__stat-label">Links</span>
                <TokenSocialLinksBar links={liveToken.socialLinks} variant="toolbar" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="token-detail-toolbar__actions">
          <button
            type="button"
            onClick={() => toggleFavorite(streamAddress, liveToken)}
            disabled={tradeLocked}
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            title={favorited ? "Remove from favorites" : "Add to favorites"}
            className={
              favorited
                ? "token-detail-toolbar__fav-btn token-detail-toolbar__fav-btn--active"
                : "token-detail-toolbar__fav-btn"
            }
          >
            <FavoriteIcon active={favorited} size="md" className="token-detail-toolbar__fav-icon" />
          </button>
          <button
            type="button"
            onClick={openAnnounceSheet}
            disabled={announceButtonDisabled}
            aria-label="Announce token"
            title="Announce"
            className="token-detail-toolbar__announce-btn"
          >
            <PumpIcon icon={faCampaign} size="md" />
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="token-detail-toolbar__share-btn"
            aria-label="Share token"
            title="Share"
          >
            <PumpIcon icon={faShare} size="md" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="token-page"
      aria-busy={isRefreshing || undefined}
    >
      <div className="token-page-grid">
        {isConnected ? (
          <div className="token-page-favorites-slot hidden lg:block">
            <TokenWatchlistStrip activeTokenAddress={tokenAddress} />
          </div>
        ) : null}

        <div className="token-page-toolbar-slot hidden lg:block">{tokenToolbar}</div>

        <div className="token-page-stack token-page-stack--sidebar hidden lg:flex">
          <TokenMarketSidebar
            id="token-market-sidebar"
            activeTokenAddress={tokenAddress}
            activeMarketSnapshot={marketSnapshot}
            showQuickTrade
          />
        </div>

        <div className="token-page-stack token-page-stack--main">
          <div className="token-mobile-toolbar-host shrink-0 lg:hidden">
            <TokenMobileHero
              token={liveToken}
              priceUsd={priceUsd}
              mcapUsd={fdvUsd}
              chartCurrency={chartCurrency}
              changePct={changeTone}
              showSocialLinks={showSocialLinks}
              favorited={favorited}
              tradeLocked={tradeLocked}
              copiedAddress={copiedAddress}
              announceBusy={announceBusy}
              onToggleFavorite={() => toggleFavorite(streamAddress, liveToken)}
              onAnnounce={openAnnounceSheet}
              onCopyAddress={() => void onCopyAddress()}
              isRefreshing={isRefreshing}
            />
          </div>

          <div
            ref={chartTapeSplit.contentRef}
            className="token-page-content-slot"
            style={chartTapeSplit.contentStyle}
          >
            <div
              className={
                chartTapeSplit.chartCollapsed
                  ? "token-page-chart-slot token-page-chart-slot--collapsed"
                  : "token-page-chart-slot"
              }
            >
              <PriceChart
                fillContainer
                tokenAddress={streamAddress}
                symbol={liveToken.symbol}
                status={liveToken.status}
                initialCandles={initialCandles}
                curveSnapshot={tradeCurveSnapshot}
                liveCandleUpdates={liveCandleUpdates}
                fallbackTrades={chartFallbackTrades}
                wsConnected={wsConnected}
                bnbUsd={effectiveBnbUsd}
  liveOnChainSpotBnb={displayPrice > 0 ? displayPrice : null}
                currency={chartCurrency}
                onCurrencyChange={setChartCurrency}
              />
            </div>

            <div
              className="token-page-split-handle"
              {...chartTapeSplit.handleProps}
            >
              <span className="token-page-split-handle__grip" aria-hidden />
            </div>

            <div className="token-page-mobile-activity lg:hidden">
              <TradeTape {...tradeTapeProps} mobileStickyHead />
            </div>

            <div className="token-page-tape-slot hidden lg:flex">
              <TradeTape {...tradeTapeProps} />
            </div>
          </div>
        </div>

        <aside className="token-page-stack token-page-stack--aside hidden lg:flex">
          <div className="token-aside-trade-slot relative hidden lg:block">
            {tradeLocked ? (
              <div className="token-page-trade-lock" aria-hidden />
            ) : null}
            <TradePanel
              tokenAddress={streamAddress as `0x${string}`}
              symbol={liveToken.symbol}
              status={liveToken.status}
              reserveBnb={liveToken.reserveBnb}
              tokenSold={liveToken.tokenSold ?? "0"}
              prefill={tradePrefill}
              onTradeOptimistic={handleTradeOptimistic}
              onTradeOptimisticRollback={handleTradeOptimisticRollback}
              onTradeSubmitted={handleTradeSubmitted}
              onTradeConfirmed={handleTradeConfirmed}
              chainCurveSnapshot={tradeCurveSnapshot}
              {...solanaTradeLiveProps}
            />
          </div>
          <CreatorRewardsCard
              creatorAddress={liveToken.creatorAddress}
              creatorDisplayUsername={liveToken.creatorDisplayUsername}
              launchTxHash={liveToken.launchTxHash}
              followerCount={liveToken.creatorFollowerCount}
              onAddressClick={setProfileAddress}
          />
          {liveToken.description?.trim() ? (
            <section className="panel-surface p-4">
              <p className="section-label">Description</p>
              <p className="mt-2 text-body-sm leading-relaxed text-pump-muted">
                {liveToken.description.trim()}
              </p>
            </section>
          ) : null}
          <TokenAnnouncementsPanel
            tokenAddress={streamAddress}
            creatorAddress={liveToken.creatorAddress}
            refreshKey={announcementsRefreshKey}
            onOpenProfile={setProfileAddress}
            currentMarketCapBnb={liveMarketCapNative}
            bnbUsd={effectiveBnbUsd}
          />
        </aside>
      </div>

      {quickTradeRun ? (
        <QuickTradeConfirmModal
          key={quickTradeRun.key}
          target={{
            tokenAddress: streamAddress as `0x${string}`,
            symbol: liveToken.symbol,
            prefill: quickTradeRun.prefill,
          }}
          status={liveToken.status}
          reserveBnb={liveToken.reserveBnb}
          tokenSold={liveToken.tokenSold ?? "0"}
          chainCurveSnapshot={tradeCurveSnapshot}
          {...solanaTradeLiveProps}
          onClose={clearQuickTradeRun}
          onFundingBlocked={handleQuickSubmitBlocked}
          onTradeOptimistic={handleTradeOptimistic}
          onTradeOptimisticRollback={handleQuickTradeOptimisticRollback}
          onTradeSubmitted={handleQuickTradeRunnerSubmitted}
          onTradeConfirmed={handleQuickTradeRunnerConfirmed}
        />
      ) : null}

      <CreatorProfileModal
        open={profileAddress != null}
        onClose={() => setProfileAddress(null)}
        creatorAddress={profileAddress ?? ""}
      />

      <ShareSheetModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        payload={sharePayload}
        title="Share token"
        description={`Spread the word about $${liveToken.symbol}.`}
      />

      <AnnounceCalloutSheet
        open={announceSheetOpen}
        onClose={closeAnnounceSheet}
        phase={announcePhase}
        tokenAddress={streamAddress}
        tokenSymbol={liveToken.symbol}
        tokenName={liveToken.name}
        tokenLogoUrl={liveToken.logoUrl}
        errorMessage={announceError}
        successMultiplierX={announceSuccessX}
        message={announceMessage}
        onMessageChange={setAnnounceMessage}
        onConfirm={() => void confirmAnnounce()}
      />

      <TradeSheet
        open={tradeSheetOpen}
        onClose={closeTradeSheet}
        tokenAddress={streamAddress as `0x${string}`}
        symbol={liveToken.symbol}
        status={liveToken.status}
        reserveBnb={liveToken.reserveBnb}
        tokenSold={liveToken.tokenSold ?? "0"}
        prefill={tradePrefill}
        onTradeOptimistic={handleTradeOptimistic}
        onTradeOptimisticRollback={handleTradeOptimisticRollback}
        onTradeSubmitted={handleTradeSubmitted}
        onTradeConfirmed={handleMobileTradeConfirmed}
        chainCurveSnapshot={tradeCurveSnapshot}
        changePct={changeTone}
        priceUsd={priceUsd}
        logoUrl={liveToken.logoUrl}
        persistTokenMobileTradePrefs
        {...solanaTradeLiveProps}
      />

    </div>
  );
}

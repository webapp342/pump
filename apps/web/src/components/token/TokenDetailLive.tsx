"use client";

import {
  PumpIcon,
  faCheck,
  faChevronDown,
  faList,
  faCopy,
  faExternalLink,
  faShare,
} from "@/lib/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPublicClient, http } from "viem";
import { useReadContract } from "wagmi";
import type { TokenHolderSnapshot, TokenDetail, TradeItem } from "@/lib/db/launchpad";
import {
  bondingCurveManagerAbi,
  bondingCurveSnapshotFromTuple,
} from "@/lib/bonding-curve";
import type { ActorOptimisticChartSpot, CandleWsUpdate } from "@/lib/candles";
import { PumpSubscriptPrice } from "@/components/ui/PumpSubscriptPrice";
import { resolveLatestSpotPriceBnb, sortTradesChronologically } from "@/lib/candles";
import { mergeWsCandleUpdates } from "@/lib/chart-series-state";
import { logChartWsMerge } from "@/lib/chart-observability";
import type { InitialChartCandles } from "@/lib/token-server";
import { resolveMarkPriceBnb } from "@/lib/mark-price";
import {
  bnbToUsd,
  estimateFdvUsd,
  tokenPriceUsd,
} from "@/lib/format-usd";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import {
  applyTradeToToken,
  blockTimeIsoFromUnixSeconds,
  resolveTradeItemsFromReceipt,
  tokenFromCurve,
  type CurveTuple,
  type ParsedTradeEvent,
} from "@/lib/launchpad-events";
import {
  mergeTrades,
  MISSION_KEYS,
  listRecentOptimisticActivities,
  pushOptimisticActivity,
  removeOptimisticActivities,
} from "@/lib/optimistic-activity";
import { contracts, explorerAddressUrl, pumpChain, shortAddress } from "@/config/chain";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { TradePanel, type TradeConfirmedPayload, type TradeOptimisticPayload, type TradeSubmittedPayload } from "@/components/token/TradePanel";
import { TradeSheet } from "@/components/token/TradeSheet";
import { TokenMobileHero } from "@/components/token/TokenMobileHero";
import { TokenTradeDock } from "@/components/token/TokenTradeDock";
import { TokenMobileMarketSheet } from "@/components/token/TokenMobileMarketSheet";
import {
  parseTradePrefillFromSearchParams,
  type TradePrefillConfig,
} from "@/lib/token-trade-prefill";
import { TradeTape } from "@/components/token/TradeTape";
import { TokenMarketSidebar } from "@/components/token/TokenMarketSidebar";
import { TokenSidebarCollapseToggle } from "@/components/token/TokenSidebarCollapseToggle";
import { useTokenSidebarWidth, type TokenSidebarDensity } from "@/hooks/useTokenSidebarWidth";
import { useTokenSidebarHeadAnchor } from "@/hooks/useTokenSidebarHeadAnchor";
import { PriceChart } from "@/components/token/PriceChart";
import { FavoriteIcon } from "@/components/icons/FavoriteIcon";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { CreatorProfileModal } from "@/components/creators/CreatorProfileModal";
import { CreatorRewardsCard } from "@/components/creators/CreatorRewardsCard";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { TokenSocialLinksBar } from "@/components/token/TokenSocialLinksBar";
import { hasSocialLinks } from "@/lib/token-social";
import { formatAge } from "@/lib/arena-board-format";
import { tokenSharePayload } from "@/lib/share-links";
import { tokenDocumentTitle } from "@/lib/token-tab-title";
import { writeLastTradeTokenAddress } from "@/lib/last-trade-token";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";
import { useRafMessageQueue } from "@/hooks/useRafMessageQueue";
import { useBondingCurveMachine } from "@/hooks/useBondingCurveMachine";
import {
  isUninitializedCurveTuple,
  machineFromSnapshot,
  machineSpotPriceBnb,
} from "@/lib/bonding-curve-state";
import {
  patchTokenDetailFromWsTrade,
  prependTradeIfNew,
  wsPayloadToTradeItem,
  type TokenTradeWsPayload,
} from "@/lib/token-live-delta";

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

function formatToolbarAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (ms < 60_000) return "just now";
  return `${formatAge(createdAt)} ago`;
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
  let merged = chainCurve ? tokenFromCurve(base, chainCurve) : base;

  if (liveTrades.length > 0) {
    const chronological = sortTradesChronologically(liveTrades);
    const spotPrice = resolveLatestSpotPriceBnb(chronological);
    merged = {
      ...merged,
      tradeCount: Math.max(merged.tradeCount, chronological.length),
      lastPriceBnb:
        spotPrice != null && spotPrice > 0
          ? String(spotPrice)
          : chronological[chronological.length - 1]?.priceBnb || merged.lastPriceBnb,
    };
  }

  return merged;
}

const publicClient = createPublicClient({
  chain: pumpChain,
  transport: http(pumpChain.rpcUrls.default.http[0]),
});

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
  const [optimisticTrades, setOptimisticTrades] = useState<TradeItem[]>([]);
  const [actorChartSpot, setActorChartSpot] = useState<ActorOptimisticChartSpot | null>(null);
  const [indexerSyncing, setIndexerSyncing] = useState(false);
  const [latestWsBonding, setLatestWsBonding] = useState<
    TokenTradeWsPayload["bonding"] | null
  >(null);
  const [chartCurrency, setChartCurrency] = useState<"usd" | "mcap">("usd");

  const streamAddress = contentSynced ? tokenAddress : token.address;

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
    setOptimisticTrades([]);
    setActorChartSpot(null);
    setIndexerSyncing(false);
    setLatestWsBonding(null);
    hydratedRef.current = false;
  }, [contentSynced, tokenAddress, initialToken, initialTrades]);
  useEffect(() => {
    if (!actorChartSpot || liveCandleUpdates.length === 0) return;
    const latest = [...liveCandleUpdates].sort((a, b) => b.time - a.time)[0];
    if (latest && latest.time * 1000 >= actorChartSpot.blockTimeMs - 30_000) {
      setActorChartSpot(null);
      setIndexerSyncing(false);
    }
  }, [liveCandleUpdates, actorChartSpot]);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [profileAddress, setProfileAddress] = useState<string | null>(null);
  const [tradePrefill, setTradePrefill] = useState<TradePrefillConfig | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [mobileMarketOpen, setMobileMarketOpen] = useState(false);
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [, setAgeTick] = useState(0);
  const tradePrefillCapturedRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { bnbUsd } = useBnbUsdPrice();
  const { expanded, sidebarWidth, toggleExpanded, gridStyle } = useTokenSidebarWidth();
  const sidebarDensity: TokenSidebarDensity = expanded ? "full" : "compact";
  const mainStackRef = useRef<HTMLDivElement>(null);
  const headWrapRef = useRef<HTMLDivElement>(null);
  const toggleTop = useTokenSidebarHeadAnchor(
    mainStackRef,
    headWrapRef,
    `${sidebarWidth}:${expanded ? 1 : 0}`
  );
  const { isFavorite, toggleFavorite } = useFavorites();
  const burstUntilRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimisticRef = useRef<TradeItem[]>([]);
  optimisticRef.current = optimisticTrades;
  const optimisticTokenSnapshotRef = useRef<TokenDetail | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (tradePrefillCapturedRef.current) return;
    const parsed = parseTradePrefillFromSearchParams(searchParams);
    if (!parsed) return;

    tradePrefillCapturedRef.current = true;
    setTradePrefill(parsed);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setTradeSheetOpen(true);
    }
    router.replace(`/token/${tokenAddress}`, { scroll: false });
  }, [searchParams, router, tokenAddress]);

  const trades = useMemo(
    () => mergeTrades(dbTrades, optimisticTrades),
    [dbTrades, optimisticTrades]
  );

  /** Chart history from DB when indexed; optimistic only while indexer lags. */
  const chartFallbackTrades = useMemo(
    () => (dbTrades.length > 0 ? dbTrades : trades),
    [dbTrades, trades]
  );

  const hasLivePending = optimisticTrades.length > 0 || indexerSyncing;
  const tradeLocked = !contentSynced;

  const { data: chainCurve, refetch: refetchCurve } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "curves",
    args: [streamAddress as `0x${string}`],
    chainId: pumpChain.id,
    query: {
      refetchInterval: hasLivePending ? BURST_POLL_MS : CHAIN_LIVE_POLL_MS,
      staleTime: 0,
    },
  });

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

  const onChainSpotBnb = useMemo(() => {
    if (!tradeCurveSnapshot) return null;
    const spot = machineSpotPriceBnb(machineFromSnapshot(tradeCurveSnapshot));
    return spot > 0 ? spot : null;
  }, [tradeCurveSnapshot]);

  const fetchLive = useCallback(async () => {
    try {
      const response = await fetch(`/api/tokens/${streamAddress}`, { cache: "no-store" });
      const body = (await response.json()) as {
        data?: { token: TokenDetail; trades: TradeItem[] };
      };

      if (!response.ok || !body.data) return;

      const dbHashes = new Set(body.data.trades.map((t) => t.txHash.toLowerCase()));
      const stillPending = optimisticRef.current.some(
        (t) => !dbHashes.has(t.txHash.toLowerCase())
      );

      removeOptimisticActivities(body.data.trades.map((t) => t.txHash));

      setDbTrades(body.data.trades);
      setOptimisticTrades((prev) =>
        prev.filter((t) => !dbHashes.has(t.txHash.toLowerCase()))
      );

      if (stillPending) {
        setIndexerSyncing(true);
        void refetchCurve();
        setToken((prev) => ({
          ...body.data!.token,
          name: body.data!.token.name || prev.name,
          symbol: body.data!.token.symbol || prev.symbol,
          creatorAddress: body.data!.token.creatorAddress || prev.creatorAddress,
          creatorFollowerCount:
            body.data!.token.creatorFollowerCount ?? prev.creatorFollowerCount ?? 0,
          description: body.data!.token.description ?? prev.description,
          socialLinks: body.data!.token.socialLinks ?? prev.socialLinks,
        }));
      } else {
        setToken(body.data.token);
        setIndexerSyncing(false);
      }
    } catch {
      // Keep last good snapshot on transient errors.
    }
  }, [streamAddress, refetchCurve]);

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
          if (payload.candleUpdates?.length) {
            const updates = payload.candleUpdates as CandleWsUpdate[];
            setLiveCandleUpdates((prev) => mergeWsCandleUpdates(prev, updates));
            for (const update of updates) {
              logChartWsMerge({
                tokenAddress: streamAddress,
                interval: update.interval,
                updateCount: updates.length,
                isNewBucket: update.isNewBucket,
              });
            }
          }
          setToken((prev) => patchTokenDetailFromWsTrade(prev, payload) ?? prev);
          setOptimisticTrades((prev) =>
            prev.filter((t) => t.txHash.toLowerCase() !== tradeItem.txHash.toLowerCase())
          );
          if (payload.candleUpdates?.length) {
            setActorChartSpot(null);
            setIndexerSyncing(false);
          }
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
    room: `token:${streamAddress.toLowerCase()}`,
    onMessage: (message) => {
      queueWsMessage(message);
    },
  });

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

  const applyOptimisticFromReceipt = useCallback(
    async (payload: TradeConfirmedPayload) => {
      if (!payload.receipt) return;
      let blockTimeIso: string | undefined;
      try {
        const block = await publicClient.getBlock({
          blockNumber: payload.receipt.blockNumber,
        });
        blockTimeIso = blockTimeIsoFromUnixSeconds(block.timestamp);
      } catch {
        // RPC hiccup — wall clock only as last resort.
      }

      const snapshotUsdRate =
        bnbUsd != null && bnbUsd > 0 ? String(bnbUsd) : undefined;

      const { items, parsed } = resolveTradeItemsFromReceipt(
        payload.receipt,
        payload.txHash,
        streamAddress as `0x${string}`,
        blockTimeIso,
        snapshotUsdRate
      );

      if (parsed.length > 0) {
        setOptimisticTrades((prev) => {
          const without = prev.filter(
            (t) => t.txHash.toLowerCase() !== payload.txHash.toLowerCase()
          );
          return [...items, ...without];
        });
        setToken((prev) =>
          parsed.reduce((next, trade) => applyTradeToToken(next, trade), prev)
        );
        void refetchCurve();
      } else {
        try {
          const curve = (await publicClient.readContract({
            address: contracts.bondingCurveManager,
            abi: bondingCurveManagerAbi,
            functionName: "curves",
            args: [streamAddress as `0x${string}`],
          })) as CurveTuple;
          setToken((prev) => tokenFromCurve(prev, curve));
          void refetchCurve();
        } catch {
          // Fall back to DB polling only.
        }
      }
    },
    [streamAddress, refetchCurve, bnbUsd]
  );

  const handleTradeOptimistic = useCallback(
    (payload: TradeOptimisticPayload) => {
      burstUntilRef.current = Date.now() + BURST_DURATION_MS;
      setIndexerSyncing(true);
      optimisticTokenSnapshotRef.current = token;
      setActorChartSpot({
        spotBeforeBnb: payload.spotBeforeBnb,
        spotAfterBnb: payload.spotAfterBnb,
        side: payload.side,
        volumeBnb: Number(payload.tradeItem.netBnb ?? payload.tradeItem.nativeAmount ?? 0),
        blockTimeMs: Date.now(),
      });
      setOptimisticTrades((prev) => [
        payload.tradeItem,
        ...prev.filter((t) => t.txHash !== payload.pendingTxHash),
      ]);
      setToken((prev) => applyTradeToToken(prev, payload.syntheticTrade));
      void refetchCurve();
    },
    [token, refetchCurve]
  );

  const handleTradeOptimisticRollback = useCallback(
    (payload: { pendingId: string }) => {
      const pendingTxHash = `pending:${payload.pendingId}`;
      setActorChartSpot(null);
      setOptimisticTrades((prev) => {
        const next = prev.filter(
          (t) => t.txHash.toLowerCase() !== pendingTxHash.toLowerCase()
        );
        if (next.length === 0) {
          optimisticTokenSnapshotRef.current = null;
        }
        return next;
      });
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
      optimisticTokenSnapshotRef.current = null;
      setOptimisticTrades((prev) =>
        prev.filter((t) => !t.txHash.toLowerCase().startsWith("pending:"))
      );

      pushOptimisticActivity({
        txHash: payload.txHash,
        type: payload.side,
        at: new Date().toISOString(),
        tokenAddress: streamAddress,
        missionKeys: [MISSION_KEYS.dailySwap],
      });

      await applyOptimisticFromReceipt(payload);
      void fetchLive();
    },
    [applyOptimisticFromReceipt, fetchLive, streamAddress]
  );

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (initialTrades.length > 0) {
      removeOptimisticActivities(initialTrades.map((t) => t.txHash));
    }

    const knownHashes = new Set(
      initialTrades.map((t) => t.txHash.toLowerCase())
    );

    const pending = listRecentOptimisticActivities().filter(
      (activity) =>
        activity.tokenAddress?.toLowerCase() === streamAddress.toLowerCase() &&
        (activity.type === "create" || activity.type === "buy" || activity.type === "sell") &&
        !knownHashes.has(activity.txHash.toLowerCase())
    );

    if (pending.length === 0) return;

    burstUntilRef.current = Date.now() + BURST_DURATION_MS;
    setIndexerSyncing(true);

    void (async () => {
      const snapshotUsdRate =
        bnbUsd != null && bnbUsd > 0 ? String(bnbUsd) : undefined;

      const receipts = await Promise.all(
        pending.map(async (activity) => {
          try {
            const receipt = await publicClient.getTransactionReceipt({
              hash: activity.txHash as `0x${string}`,
            });
            return { activity, receipt };
          } catch {
            return null;
          }
        })
      );

      const batchItems: TradeItem[] = [];
      const parsedTrades: ParsedTradeEvent[] = [];
      const dropHashes = new Set<string>();

      for (const row of receipts) {
        if (!row) continue;
        dropHashes.add(row.activity.txHash.toLowerCase());

        let blockTimeIso: string | undefined;
        try {
          const block = await publicClient.getBlock({
            blockNumber: row.receipt.blockNumber,
          });
          blockTimeIso = blockTimeIsoFromUnixSeconds(block.timestamp);
        } catch {
          // wall clock fallback inside tradeEventToItem
        }

        const { items, parsed } = resolveTradeItemsFromReceipt(
          row.receipt,
          row.activity.txHash,
          streamAddress as `0x${string}`,
          blockTimeIso,
          snapshotUsdRate
        );
        batchItems.push(...items);
        parsedTrades.push(...parsed);
      }

      if (batchItems.length > 0) {
        setOptimisticTrades((prev) => {
          const without = prev.filter(
            (t) => !dropHashes.has(t.txHash.toLowerCase())
          );
          return [...batchItems, ...without];
        });
        setToken((prev) =>
          parsedTrades.reduce((next, trade) => applyTradeToToken(next, trade), prev)
        );
        void refetchCurve();
      }

      void fetchLive();
    })();
  }, [bnbUsd, fetchLive, initialTrades, refetchCurve, streamAddress]);

  const displayPrice =
    onChainSpotBnb ??
    resolveMarkPriceBnb(liveToken, trades, chainCurve as CurveTuple | undefined);
  const priceUsd = tokenPriceUsd(displayPrice, bnbUsd);
  const fdvUsd = estimateFdvUsd(displayPrice, bnbUsd);

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
    const computed = compute24hPriceChange(trades, displayPrice, bnbUsd);
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
      changeUsd: bnbUsd != null ? changeBnb * bnbUsd : null,
    };
  }, [trades, displayPrice, bnbUsd, liveToken.change24hPct]);

  const volume24hUsd = bnbToUsd(volume24hBnb, bnbUsd);
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

  const tradeTapeProps = {
    tokenAddress: streamAddress,
    creatorAddress: liveToken.creatorAddress,
    symbol: liveToken.symbol,
    headTrades: trades,
    wsConnected,
    holdersRefreshKey,
    initialHolders,
    currentPriceBnb: displayPrice,
    bnbUsd,
    onAddressClick: setProfileAddress,
    creatorDisplayUsername: liveToken.creatorDisplayUsername,
    launchTxHash: liveToken.launchTxHash,
    followerCount: liveToken.creatorFollowerCount,
    tokenDescription: liveToken.description,
  };

  useEffect(() => {
    const timer = setInterval(() => setAgeTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setMobileMarketOpen(false);
    setTradeSheetOpen(false);
    setTradePrefill(null);
  }, [tokenAddress]);

  const closeMobileMarket = useCallback(() => setMobileMarketOpen(false), []);
  const openMobileMarket = useCallback(() => {
    setMobileMarketOpen(true);
  }, []);

  const openMarketFromTradeSheet = useCallback(() => {
    setTradeSheetOpen(false);
    setTradePrefill(null);
    setMobileMarketOpen(true);
  }, []);

  const closeTradeSheet = useCallback(() => {
    setTradeSheetOpen(false);
    setTradePrefill(null);
  }, []);

  const openMobileTrade = useCallback((side: "buy" | "sell") => {
    setTradePrefill({ side });
    setTradeSheetOpen(true);
  }, []);

  const handleMobileTradeConfirmed = useCallback(
    async (payload: TradeConfirmedPayload) => {
      await handleTradeConfirmed(payload);
      setTradeSheetOpen(false);
      setTradePrefill(null);
    },
    [handleTradeConfirmed]
  );

  const tokenToolbar = (
    <div
      className={`token-detail-toolbar panel-surface ${
        isRefreshing ? "token-detail-toolbar--refreshing" : ""
      }`}
    >
      <h1 className="sr-only">
        {liveToken.name} ({liveToken.symbol}/USD)
      </h1>
      <div className="token-detail-toolbar__row">
        <div className="token-detail-toolbar__identity">
          <button
            type="button"
            onClick={() => toggleFavorite(streamAddress)}
            disabled={tradeLocked}
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            title={favorited ? "Remove from favorites" : "Add to favorites"}
            className={
              favorited
                ? "token-detail-toolbar__fav-btn token-detail-toolbar__fav-btn--active"
                : "token-detail-toolbar__fav-btn"
            }
          >
            <FavoriteIcon active={favorited} className="token-detail-toolbar__fav-icon" />
          </button>
          <TokenAvatar
            address={liveToken.address}
            symbol={liveToken.symbol}
            logoUrl={liveToken.logoUrl}
            size={28}
            className="token-detail-toolbar__logo shrink-0 !ring-0"
          />
          <div className="token-detail-toolbar__pair-meta">
            <div className="token-detail-toolbar__symbol-row">
              <span className="token-detail-toolbar__symbol financial-value">
                {liveToken.symbol}/USD
              </span>
              <button
                type="button"
                className="token-detail-toolbar__market-toggle lg:hidden"
                aria-expanded={mobileMarketOpen}
                aria-controls="token-mobile-market-sheet"
                aria-label="Explore coins"
                onClick={openMobileMarket}
              >
                <PumpIcon icon={faList} className="h-4 w-4" />
              </button>
            </div>
            <span className="token-detail-toolbar__age">{formatToolbarAge(liveToken.createdAt)}</span>
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
                  <PumpIcon icon={faExternalLink} className="h-[14px] w-[14px]" />
                </a>
                <button
                  type="button"
                  onClick={() => void onCopyAddress()}
                  className="token-detail-toolbar__contract-btn"
                  aria-label={copiedAddress ? "Address copied" : "Copy contract address"}
                >
                  {copiedAddress ? (
                    <PumpIcon icon={faCheck} className="h-[14px] w-[14px]" />
                  ) : (
                    <PumpIcon icon={faCopy} className="h-[14px] w-[14px]" />
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
            onClick={() => setShareOpen(true)}
            className="token-detail-toolbar__share-btn"
            aria-label="Share token"
            title="Share"
          >
            <PumpIcon icon={faShare} className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`token-page ${!contentSynced ? "token-page--switching" : ""}`}
      aria-busy={isRefreshing || undefined}
    >
      <div className="token-page-grid" style={gridStyle}>
        <div className="token-page-toolbar-slot hidden lg:block">{tokenToolbar}</div>

        <div className="token-page-stack token-page-stack--sidebar hidden lg:flex">
          <TokenMarketSidebar
            id="token-market-sidebar"
            activeTokenAddress={tokenAddress}
            density={sidebarDensity}
            headWrapRef={headWrapRef}
            showQuickTrade
          />
        </div>

        <div className="token-page-stack token-page-stack--main" ref={mainStackRef}>
          {toggleTop != null ? (
            <TokenSidebarCollapseToggle
              expanded={expanded}
              onToggle={toggleExpanded}
              className="token-sidebar-collapse-toggle--chart-side hidden lg:flex"
              style={{ top: toggleTop }}
            />
          ) : null}
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
              marketSelectorOpen={mobileMarketOpen}
              onOpenMarket={openMobileMarket}
              onToggleFavorite={() => toggleFavorite(streamAddress)}
              onCopyAddress={() => void onCopyAddress()}
              isRefreshing={isRefreshing}
            />
          </div>

          <div className="token-page-content-slot">
            <div className="token-page-chart-slot">
              <PriceChart
                fillContainer
                tokenAddress={streamAddress}
                symbol={liveToken.symbol}
                status={liveToken.status}
                initialCandles={initialCandles}
                actorOptimisticSpot={actorChartSpot}
                curveSnapshot={tradeCurveSnapshot}
                liveCandleUpdates={liveCandleUpdates}
                fallbackTrades={chartFallbackTrades}
                wsConnected={wsConnected}
                bnbUsd={bnbUsd}
                liveOnChainSpotBnb={onChainSpotBnb}
                currency={chartCurrency}
                onCurrencyChange={setChartCurrency}
              />
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
            />
          </div>
          <CreatorRewardsCard
              creatorAddress={liveToken.creatorAddress}
              creatorDisplayUsername={liveToken.creatorDisplayUsername}
              launchTxHash={liveToken.launchTxHash}
              followerCount={liveToken.creatorFollowerCount}
              onAddressClick={setProfileAddress}
          />
          <section className="panel-surface p-4">
            <p className="section-label">Description</p>
            <p className="mt-2 text-body-sm leading-relaxed text-pump-muted">
              {liveToken.description?.trim() || "No description provided."}
            </p>
          </section>
        </aside>
      </div>

      <TokenTradeDock
        disabled={tradeLocked}
        onBuy={() => openMobileTrade("buy")}
        onSell={() => openMobileTrade("sell")}
      />

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

      <TokenMobileMarketSheet
        open={mobileMarketOpen}
        onClose={closeMobileMarket}
        activeTokenAddress={tokenAddress}
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
        onOpenMarket={openMarketFromTradeSheet}
      />

    </div>
  );
}

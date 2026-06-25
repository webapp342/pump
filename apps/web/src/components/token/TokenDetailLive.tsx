"use client";

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
import { resolveLatestSpotPriceBnb, sortTradesChronologically } from "@/lib/candles";
import { mergeWsCandleUpdates } from "@/lib/chart-series-state";
import { logChartWsMerge } from "@/lib/chart-observability";
import type { InitialChartCandles } from "@/lib/token-server";
import { resolveMarkPriceBnb } from "@/lib/mark-price";
import {
  estimateFdvUsd,
  formatUsdReadable,
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
import { contracts, pumpChain, shortAddress } from "@/config/chain";
import { TradePanel, type TradeConfirmedPayload, type TradeOptimisticPayload, type TradeSubmittedPayload } from "@/components/token/TradePanel";
import { TradeSheet } from "@/components/token/TradeSheet";
import {
  parseTradePrefillFromSearchParams,
  type TradePrefillConfig,
} from "@/lib/token-trade-prefill";
import { TradeTape } from "@/components/token/TradeTape";
import { PriceChart } from "@/components/token/PriceChart";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { CreatorProfileModal } from "@/components/creators/CreatorProfileModal";
import { CreatorRewardsCard } from "@/components/creators/CreatorRewardsCard";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { TokenSocialLinksBar } from "@/components/token/TokenSocialLinksBar";
import { TokenAirdropLinkChip } from "@/components/token/TokenLinkedAirdropStrip";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { hasSocialLinks } from "@/lib/token-social";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { tokenSharePayload } from "@/lib/share-links";
import { shellPaddingXClass } from "@/components/layout/layout-shell";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";
import { useRafMessageQueue } from "@/hooks/useRafMessageQueue";
import { useBondingCurveMachine } from "@/hooks/useBondingCurveMachine";
import {
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

function formatElapsedSince(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] fill-none stroke-current">
      <path
        d="M8 12v7a1 1 0 001 1h8a1 1 0 001-1v-7M12 3v12M7 8l5-5 5 5"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[16px] w-[16px] fill-none stroke-current">
      <rect x="9" y="9" width="11" height="11" rx="2" strokeWidth="1.6" />
      <path d="M7 15H6a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" strokeWidth="1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[16px] w-[16px] fill-none stroke-current">
      <path d="M5 12l4 4 10-10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type TokenDetailLiveProps = {
  tokenAddress: string;
  symbol: string;
  status: string;
  initialToken: TokenDetail;
  initialTrades: TradeItem[];
  initialHolders?: TokenHolderSnapshot[];
  initialCandles?: InitialChartCandles;
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
}: TokenDetailLiveProps) {
  const [token, setToken] = useState(initialToken);
  const [dbTrades, setDbTrades] = useState(initialTrades);
  const [liveCandleUpdates, setLiveCandleUpdates] = useState<CandleWsUpdate[]>([]);

  useEffect(() => {
    setLiveCandleUpdates([]);
  }, [tokenAddress]);

  // Reconcile: if real candle data from indexer arrives covering the optimistic trade time, drop the transient actor view.
  // This ensures the trader sees authoritative data once it lands, and other viewers were never seeing the actor patch.
  const [holdersRefreshKey, setHoldersRefreshKey] = useState(0);
  const [optimisticTrades, setOptimisticTrades] = useState<TradeItem[]>([]);
  const [actorChartSpot, setActorChartSpot] = useState<ActorOptimisticChartSpot | null>(null);
  const [indexerSyncing, setIndexerSyncing] = useState(false);

  // Reconcile: if real candle data from indexer arrives covering the optimistic trade time, drop the transient actor view.
  // Trader sees authoritative once it lands; other viewers never saw the client-only patch.
  useEffect(() => {
    if (!actorChartSpot || liveCandleUpdates.length === 0) return;
    const latest = [...liveCandleUpdates].sort((a, b) => b.time - a.time)[0];
    if (latest && latest.time * 1000 >= actorChartSpot.blockTimeMs - 30_000) {
      setActorChartSpot(null);
      setIndexerSyncing(false);
    }
  }, [liveCandleUpdates, actorChartSpot]);
  const [latestWsBonding, setLatestWsBonding] = useState<
    TokenTradeWsPayload["bonding"] | null
  >(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [profileAddress, setProfileAddress] = useState<string | null>(null);
  const [tradePrefill, setTradePrefill] = useState<TradePrefillConfig | null>(null);
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const tradePrefillCapturedRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { bnbUsd } = useBnbUsdPrice();
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
    setTradeSheetOpen(true);
    router.replace(`/token/${tokenAddress}`, { scroll: false });
  }, [searchParams, router, tokenAddress]);

  const openMobileTrade = useCallback((side: "buy" | "sell") => {
    setTradePrefill({ side });
    setTradeSheetOpen(true);
  }, []);

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

  const { data: chainCurve, refetch: refetchCurve } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "curves",
    args: [tokenAddress as `0x${string}`],
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

  const chainCurveSnapshot = useMemo(
    () =>
      chainCurve ? bondingCurveSnapshotFromTuple(chainCurve as CurveTuple) : undefined,
    [chainCurve]
  );

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
      const response = await fetch(`/api/tokens/${tokenAddress}`, { cache: "no-store" });
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
  }, [tokenAddress, refetchCurve]);

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
                tokenAddress,
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
  }, [tokenAddress]);

  const queueWsMessage = useRafMessageQueue(applyWsMessages);

  const { connected: wsConnected } = useLiveChannel({
    room: `token:${tokenAddress.toLowerCase()}`,
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
        tokenAddress as `0x${string}`,
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
            args: [tokenAddress as `0x${string}`],
          })) as CurveTuple;
          setToken((prev) => tokenFromCurve(prev, curve));
          void refetchCurve();
        } catch {
          // Fall back to DB polling only.
        }
      }
    },
    [tokenAddress, refetchCurve, bnbUsd]
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
      setOptimisticTrades((prev) =>
        prev.filter((t) => t.txHash.toLowerCase() !== pendingTxHash.toLowerCase())
      );
      if (optimisticTokenSnapshotRef.current) {
        setToken(optimisticTokenSnapshotRef.current);
        optimisticTokenSnapshotRef.current = null;
      }
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
        tokenAddress,
        missionKeys: [MISSION_KEYS.dailySwap],
      });

      await applyOptimisticFromReceipt(payload);
      void fetchLive();
    },
    [applyOptimisticFromReceipt, fetchLive, tokenAddress]
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
        activity.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase() &&
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
          tokenAddress as `0x${string}`,
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
  }, [bnbUsd, fetchLive, initialTrades, refetchCurve, tokenAddress]);

  const displayPrice =
    onChainSpotBnb ??
    resolveMarkPriceBnb(liveToken, trades, chainCurve as CurveTuple | undefined);
  const priceUsd = tokenPriceUsd(displayPrice, bnbUsd);
  const fdvUsd = estimateFdvUsd(displayPrice, bnbUsd);
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

  const sharePayload = useMemo(
    () => tokenSharePayload(liveToken),
    [liveToken]
  );

  async function onCopyAddress() {
    const ok = await copyToClipboard(liveToken.address);
    setCopiedAddress(ok);
    if (ok) setTimeout(() => setCopiedAddress(false), 2000);
  }

  function onShare() {
    setShareOpen(true);
  }

  const elapsed = formatElapsedSince(liveToken.createdAt);
  const favorited = isFavorite(tokenAddress);
  const creatorLabel = shortAddress(liveToken.creatorAddress);

  const creatorMeta = (
    <button
      type="button"
      onClick={() => setProfileAddress(liveToken.creatorAddress)}
      className="inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-caption text-pump-muted transition hover:text-pump-text"
      aria-label={`View creator profile ${creatorLabel}`}
    >
      <UserAvatarForAddress address={liveToken.creatorAddress} size={20} className="shrink-0" />
      <span className="financial-value truncate">{creatorLabel}</span>
    </button>
  );

  const tokenActions = (
    <div className="segment-control">
      <button
        type="button"
        onClick={onShare}
        className="inline-flex h-8 w-8 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
        aria-label="Share"
      >
        <ShareIcon />
      </button>
      <button
        type="button"
        onClick={() => void onCopyAddress()}
        className="inline-flex h-8 w-8 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
        aria-label={copiedAddress ? "Address copied" : "Copy token address"}
      >
        {copiedAddress ? <CheckIcon /> : <CopyIcon />}
      </button>
      <button
        type="button"
        onClick={() => toggleFavorite(tokenAddress)}
        aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
        className={
          favorited
            ? "inline-flex h-8 w-8 items-center justify-center text-lg leading-none text-pump-accent transition hover:bg-pump-accent/10"
            : "inline-flex h-8 w-8 items-center justify-center text-lg leading-none text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
        }
      >
        {favorited ? "★" : "☆"}
      </button>
    </div>
  );

  const creatorElapsedMeta = (
    <div className="flex min-w-0 items-center gap-x-2 overflow-hidden text-caption font-normal text-pump-muted">
      {creatorMeta}
      <span className="shrink-0 text-pump-muted/40" aria-hidden>
        ·
      </span>
      <span className="shrink-0 whitespace-nowrap text-pump-muted/65">{elapsed}</span>
    </div>
  );

  const tokenMetaLine = (
    <div className="flex min-w-0 items-center gap-x-2 overflow-hidden text-caption text-pump-muted">
      <span className="financial-value shrink-0 font-medium text-pump-text">${liveToken.symbol}</span>
      <TokenAirdropLinkChip tokenAddress={tokenAddress} />
      <span className="shrink-0 text-pump-muted/45" aria-hidden>
        ·
      </span>
      {creatorElapsedMeta}
    </div>
  );

  return (
    <div className="mt-3 space-y-5 pb-[var(--mobile-token-footer-height)] md:mt-4 md:space-y-6 lg:pb-0">
      <header className="lg:hidden">
        <div className="flex items-center gap-3">
          <TokenAvatar
            address={liveToken.address}
            symbol={liveToken.symbol}
            logoUrl={liveToken.logoUrl}
            size={44}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="financial-value min-w-0 truncate text-h2 font-semibold tracking-tight text-pump-text">
                ${liveToken.symbol}
              </h1>
              <TokenAirdropLinkChip tokenAddress={tokenAddress} className="lg:hidden" />
            </div>
            <div className="mt-0.5 min-w-0 overflow-hidden">
              {creatorElapsedMeta}
            </div>
          </div>
          {tokenActions}
        </div>
        {hasSocialLinks(liveToken.socialLinks) ? (
          <div className="mt-3 border-t border-pump-border/10 pt-3">
            <TokenSocialLinksBar links={liveToken.socialLinks} variant="mobile" />
          </div>
        ) : null}
      </header>

      <header className="hidden flex-wrap items-start justify-between gap-4 lg:flex">
        <div className="flex min-w-0 items-start gap-3">
          <TokenAvatar
            address={liveToken.address}
            symbol={liveToken.symbol}
            logoUrl={liveToken.logoUrl}
            size={48}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="min-w-0 truncate section-heading">{liveToken.name}</h1>
              <TokenSocialLinksBar links={liveToken.socialLinks} inline />
            </div>
            <div className="mt-0.5">{tokenMetaLine}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            className="secondary-button inline-flex h-8 items-center gap-2 px-3 text-body-sm"
            aria-label="Share"
          >
            <ShareIcon />
            <span>Share</span>
          </button>
          <button
            type="button"
            onClick={() => void onCopyAddress()}
            className="secondary-button inline-flex h-8 items-center gap-2 px-3 text-body-sm"
            aria-label={copiedAddress ? "Address copied" : "Copy token address"}
          >
            {copiedAddress ? <CheckIcon /> : <CopyIcon />}
            <span className="financial-value">{shortAddress(liveToken.address)}</span>
          </button>
          <button
            type="button"
            onClick={() => toggleFavorite(tokenAddress)}
            title={favorited ? "Remove from favorites" : "Add to favorites"}
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            className={
              favorited
                ? "toolbar-btn !w-10 border-pump-accent/45 bg-pump-accent/12 text-lg leading-none text-pump-accent"
                : "secondary-button inline-flex h-8 w-10 items-center justify-center text-lg leading-none"
            }
          >
            {favorited ? "★" : "☆"}
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <PriceChart
            tokenAddress={tokenAddress}
            symbol={symbol}
            status={liveToken.status}
            initialCandles={initialCandles}
            actorOptimisticSpot={actorChartSpot}
            curveSnapshot={tradeCurveSnapshot}
            liveCandleUpdates={liveCandleUpdates}
            fallbackTrades={chartFallbackTrades}
            wsConnected={wsConnected}
            bnbUsd={bnbUsd}
            liveOnChainSpotBnb={onChainSpotBnb}
            currentPriceUsd={priceUsd}
            currentMcapUsd={fdvUsd}
            volume24hBnb={volume24hBnb}
            price24hChangePct={change24h?.changePct ?? null}
          />

          {indexerSyncing ? (
            <p className="text-caption text-pump-muted">Indexer syncing…</p>
          ) : null}

          <div className="pt-3">
            <TradeTape
              tokenAddress={tokenAddress}
              creatorAddress={liveToken.creatorAddress}
              symbol={liveToken.symbol}
              headTrades={trades}
              wsConnected={wsConnected}
              holdersRefreshKey={holdersRefreshKey}
              initialHolders={initialHolders}
              currentPriceBnb={displayPrice}
              bnbUsd={bnbUsd}
              onAddressClick={setProfileAddress}
            />
          </div>
        </div>

        <aside className="min-w-0 w-full space-y-5 lg:sticky lg:top-[4.75rem] lg:self-start">
          <div className="hidden lg:block">
            <TradePanel
              tokenAddress={tokenAddress as `0x${string}`}
              symbol={symbol}
              status={liveToken.status}
              reserveBnb={liveToken.reserveBnb}
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
            launchTxHash={liveToken.launchTxHash}
            followerCount={liveToken.creatorFollowerCount}
            onAddressClick={setProfileAddress}
          />
          {liveToken.description ? (
            <section className="panel-surface p-4">
              <p className="section-label">About</p>
              <p className="mt-2 text-body-sm leading-relaxed text-pump-muted">
                {liveToken.description}
              </p>
            </section>
          ) : null}
        </aside>
      </div>

      <div className="token-trade-dock lg:hidden" role="toolbar" aria-label="Trade actions">
        <div className={`token-trade-dock-inner ${shellPaddingXClass}`}>
          <div className="token-trade-dock-actions">
            <button
              type="button"
              className="token-trade-dock-buy"
              onClick={() => openMobileTrade("buy")}
            >
              Buy ${liveToken.symbol}
            </button>
            <button
              type="button"
              className="token-trade-dock-sell"
              onClick={() => openMobileTrade("sell")}
            >
              Sell ${liveToken.symbol}
            </button>
          </div>
        </div>
      </div>

      <TradeSheet
        open={tradeSheetOpen}
        onClose={() => setTradeSheetOpen(false)}
        tokenAddress={tokenAddress as `0x${string}`}
        symbol={symbol}
        status={liveToken.status}
        reserveBnb={liveToken.reserveBnb}
        prefill={tradePrefill}
        onTradeOptimistic={handleTradeOptimistic}
        onTradeOptimisticRollback={handleTradeOptimisticRollback}
        onTradeSubmitted={handleTradeSubmitted}
        onTradeConfirmed={handleTradeConfirmed}
        chainCurveSnapshot={tradeCurveSnapshot}
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
    </div>
  );
}

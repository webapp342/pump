"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPublicClient, http } from "viem";
import { useReadContract } from "wagmi";
import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import { bondingCurveManagerAbi, bondingCurveSnapshotFromTuple, displayTokenPriceBnb } from "@/lib/bonding-curve";
import {
  estimateFdvUsd,
  tokenPriceUsd,
} from "@/lib/format-usd";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import {
  applyTradeToToken,
  parseTradesFromReceipt,
  tokenFromCurve,
  tradeEventToItem,
  type CurveTuple,
} from "@/lib/launchpad-events";
import {
  mergeTrades,
  MISSION_KEYS,
  listRecentOptimisticActivities,
  pushOptimisticActivity,
} from "@/lib/optimistic-activity";
import { contracts, pumpChain, shortAddress } from "@/config/chain";
import { TradePanel, type TradeConfirmedPayload } from "@/components/token/TradePanel";
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
import { TokenSocialLinksBar } from "@/components/token/TokenSocialLinksBar";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { hasSocialLinks } from "@/lib/token-social";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";

const POLL_MS = 4_000;
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
};

function resolveDisplayPriceBnb(token: TokenDetail, liveTrades: TradeItem[]): number {
  const fromTrade = liveTrades.find((t) => Number(t.priceBnb) > 0);
  if (fromTrade) return Number(fromTrade.priceBnb);

  const fromDb = Number(token.lastPriceBnb);
  if (fromDb > 0) return fromDb;

  return displayTokenPriceBnb(token.lastPriceBnb, token.tradeCount);
}

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
    merged = {
      ...merged,
      tradeCount: Math.max(merged.tradeCount, liveTrades.length),
      lastPriceBnb: liveTrades[0].priceBnb || merged.lastPriceBnb,
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
}: TokenDetailLiveProps) {
  const [token, setToken] = useState(initialToken);
  const [dbTrades, setDbTrades] = useState(initialTrades);
  const [optimisticTrades, setOptimisticTrades] = useState<TradeItem[]>([]);
  const [indexerSyncing, setIndexerSyncing] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [profileAddress, setProfileAddress] = useState<string | null>(null);
  const [tradePrefill, setTradePrefill] = useState<TradePrefillConfig | null>(null);
  const tradePrefillCapturedRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { bnbUsd } = useBnbUsdPrice();
  const { isFavorite, toggleFavorite } = useFavorites();
  const burstUntilRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimisticRef = useRef<TradeItem[]>([]);
  optimisticRef.current = optimisticTrades;
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (tradePrefillCapturedRef.current) return;
    const parsed = parseTradePrefillFromSearchParams(searchParams);
    if (!parsed) return;

    tradePrefillCapturedRef.current = true;
    setTradePrefill(parsed);
    if (parsed.side === "buy") {
      setTradeSheetOpen(true);
    }
    router.replace(`/token/${tokenAddress}`, { scroll: false });
  }, [searchParams, router, tokenAddress]);

  const trades = useMemo(
    () => mergeTrades(dbTrades, optimisticTrades),
    [dbTrades, optimisticTrades]
  );

  const hasLivePending = optimisticTrades.length > 0 || indexerSyncing;

  const { data: chainCurve, refetch: refetchCurve } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "curves",
    args: [tokenAddress as `0x${string}`],
    chainId: pumpChain.id,
    query: {
      refetchInterval: hasLivePending ? BURST_POLL_MS : POLL_MS,
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

  const { connected: wsConnected } = useLiveChannel({
    room: `token:${tokenAddress.toLowerCase()}`,
    onMessage: (message) => {
      const payload = message as { type?: string };
      if (payload.type === "trade" || payload.type === "board_delta") {
        void fetchLiveRef.current();
      }
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
      const parsed = parseTradesFromReceipt(
        payload.receipt,
        tokenAddress as `0x${string}`
      );

      if (parsed.length > 0) {
        const items = parsed.map((trade, index) =>
          tradeEventToItem(trade, payload.txHash, index)
        );
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
    [tokenAddress, refetchCurve]
  );

  const handleTradeConfirmed = useCallback(
    async (payload: TradeConfirmedPayload) => {
      burstUntilRef.current = Date.now() + BURST_DURATION_MS;
      setIndexerSyncing(true);

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

    const pending = listRecentOptimisticActivities().filter(
      (activity) =>
        activity.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase() &&
        (activity.type === "create" || activity.type === "buy" || activity.type === "sell")
    );

    if (pending.length === 0) return;

    burstUntilRef.current = Date.now() + BURST_DURATION_MS;
    setIndexerSyncing(true);

    void (async () => {
      for (const activity of pending) {
        try {
          const receipt = await publicClient.getTransactionReceipt({
            hash: activity.txHash as `0x${string}`,
          });
          await applyOptimisticFromReceipt({
            txHash: activity.txHash,
            side: activity.type === "sell" ? "sell" : "buy",
            receipt,
          });
        } catch {
          // DB polling will catch up.
        }
      }
      void fetchLive();
    })();
  }, [applyOptimisticFromReceipt, fetchLive, tokenAddress]);

  const displayPrice = resolveDisplayPriceBnb(liveToken, trades);
  const priceUsd = tokenPriceUsd(displayPrice, bnbUsd);
  const fdvUsd = estimateFdvUsd(displayPrice, bnbUsd);
  const volume24hBnb = useMemo(() => computeVolumeWindowBnb(trades, 86_400_000), [trades]);
  const change24h = useMemo(
    () => compute24hPriceChange(trades, displayPrice, bnbUsd),
    [trades, displayPrice, bnbUsd]
  );

  async function onCopyAddress() {
    const ok = await copyToClipboard(liveToken.address);
    setCopiedAddress(ok);
    if (ok) setTimeout(() => setCopiedAddress(false), 2000);
  }

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = { title: `${liveToken.name} (${liveToken.symbol})`, text: liveToken.name, url };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await copyToClipboard(url || liveToken.address);
    } catch {
      // ignore cancelled share
    }
  }

  const elapsed = formatElapsedSince(liveToken.createdAt);
  const favorited = isFavorite(tokenAddress);
  const creatorLabel = shortAddress(liveToken.creatorAddress);

  const creatorMeta = (
    <button
      type="button"
      onClick={() => setProfileAddress(liveToken.creatorAddress)}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-caption text-pump-muted transition hover:text-pump-text"
      aria-label={`View creator profile ${creatorLabel}`}
    >
      <UserAvatarForAddress address={liveToken.creatorAddress} size={20} />
      <span className="financial-value truncate">{creatorLabel}</span>
    </button>
  );

  const tokenActions = (
    <div className="inline-flex items-center rounded-xl border border-pump-border/20 bg-pump-surface/35 p-1">
      <button
        type="button"
        onClick={() => void onShare()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-pump-muted transition hover:bg-pump-surface/80 hover:text-pump-text"
        aria-label="Share"
      >
        <ShareIcon />
      </button>
      <span className="h-5 w-px bg-pump-border/25" aria-hidden />
      <button
        type="button"
        onClick={() => void onCopyAddress()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-pump-muted transition hover:bg-pump-surface/80 hover:text-pump-text"
        aria-label={copiedAddress ? "Address copied" : "Copy token address"}
      >
        {copiedAddress ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className="h-5 w-px bg-pump-border/25" aria-hidden />
      <button
        type="button"
        onClick={() => toggleFavorite(tokenAddress)}
        aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
        className={
          favorited
            ? "inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg leading-none text-pump-accent transition hover:bg-pump-accent/10"
            : "inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg leading-none text-pump-muted transition hover:bg-pump-surface/80 hover:text-pump-text"
        }
      >
        {favorited ? "★" : "☆"}
      </button>
    </div>
  );

  const creatorElapsedMeta = (
    <>
      {creatorMeta}
      <span className="text-pump-muted/45" aria-hidden>
        ·
      </span>
      <span className="shrink-0">{elapsed}</span>
    </>
  );

  const tokenMetaLine = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-pump-muted">
      <span className="financial-value font-medium text-pump-text">${liveToken.symbol}</span>
      <span className="text-pump-muted/45" aria-hidden>
        ·
      </span>
      {creatorElapsedMeta}
    </div>
  );

  return (
    <div className="mt-3 space-y-5 pb-20 md:mt-4 md:space-y-6 xl:pb-0">
      <header className="xl:hidden">
        <div className="flex items-center gap-3">
          <TokenAvatar
            address={liveToken.address}
            symbol={liveToken.symbol}
            logoUrl={liveToken.logoUrl}
            size={44}
          />
          <div className="min-w-0 flex-1">
            <h1 className="financial-value truncate text-h2 font-semibold tracking-tight text-pump-text">
              ${liveToken.symbol}
            </h1>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-pump-muted">
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

      <header className="hidden flex-wrap items-start justify-between gap-4 xl:flex">
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
            onClick={() => void onShare()}
            className="secondary-button inline-flex h-10 items-center gap-2 px-3.5 text-body-sm"
            aria-label="Share"
          >
            <ShareIcon />
            <span>Share</span>
          </button>
          <button
            type="button"
            onClick={() => void onCopyAddress()}
            className="secondary-button inline-flex h-10 items-center gap-2 px-3.5 text-body-sm"
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
                ? "inline-flex h-10 w-10 items-center justify-center rounded-md border border-pump-accent/35 bg-pump-accent/12 text-lg leading-none text-pump-accent transition hover:border-pump-accent/50 hover:bg-pump-accent/18 hover:text-pump-accent"
                : "secondary-button inline-flex h-10 w-10 items-center justify-center text-lg leading-none"
            }
          >
            {favorited ? "★" : "☆"}
          </button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-6">
          <PriceChart
            tokenAddress={tokenAddress}
            symbol={symbol}
            status={liveToken.status}
            optimisticTrades={optimisticTrades}
            wsConnected={wsConnected}
            bnbUsd={bnbUsd}
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
              trades={trades}
              wsConnected={wsConnected}
              currentPriceBnb={displayPrice}
              bnbUsd={bnbUsd}
              onAddressClick={setProfileAddress}
            />
          </div>
        </div>

        <aside className="min-w-0 w-full space-y-4 xl:sticky xl:top-20 xl:self-start">
          <div className="hidden xl:block">
            <TradePanel
              tokenAddress={tokenAddress as `0x${string}`}
              symbol={symbol}
              status={liveToken.status}
              reserveBnb={liveToken.reserveBnb}
              prefill={tradePrefill}
              onTradeConfirmed={handleTradeConfirmed}
              chainCurveSnapshot={chainCurveSnapshot}
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

      <div className="pointer-events-none fixed bottom-[4.25rem] left-0 right-0 z-30 px-4 xl:hidden">
        <div className="pointer-events-auto mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={() => setTradeSheetOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-pump-accent py-3.5 text-body-sm font-semibold text-pump-accent-foreground shadow-panelDark transition hover:opacity-95 active:scale-[0.99]"
          >
            Buy ${symbol}
          </button>
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
        onTradeConfirmed={handleTradeConfirmed}
        chainCurveSnapshot={chainCurveSnapshot}
      />

      <CreatorProfileModal
        open={profileAddress != null}
        onClose={() => setProfileAddress(null)}
        creatorAddress={profileAddress ?? ""}
      />
    </div>
  );
}

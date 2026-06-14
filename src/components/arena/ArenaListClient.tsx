"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { KothSummary, TokenListItem } from "@/lib/db/launchpad";
import { ArenaSkeleton } from "@/components/arena/ArenaSkeleton";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import {
  formatAge,
  formatCapForBoard,
  formatSignedPct,
  pctTone,
} from "@/lib/arena-board-format";
import { useLiveChannel, resolveLivePollDelay } from "@/hooks/useLiveChannel";
import { useLiveBoardAnimations } from "@/hooks/useLiveBoardAnimations";

type FlashTone = "up" | "down";
type BoardFilter = "all" | "new" | "highVol" | "movers" | "kothContenders" | "favorites";
type SortKey = "mcap" | "ath" | "age" | "txns" | "vol24h" | "traders" | "h1" | "h6" | "h24";
type SortDir = "asc" | "desc";

function MetricValueWith24hChange({
  value,
  changePct,
  compact = false,
}: {
  value: string;
  changePct: number | null;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        <span className="financial-value text-caption font-semibold text-pump-text md:text-body-sm">
          {value}
        </span>
        <span className={`financial-value text-[10px] font-medium md:text-caption ${pctTone(changePct)}`}>
          {formatSignedPct(changePct)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="financial-value text-body-sm font-semibold text-pump-text">{value}</span>
      <span className={`financial-value text-caption font-medium ${pctTone(changePct)}`}>
        {formatSignedPct(changePct)}
      </span>
    </div>
  );
}

function HighlightStatCard({
  href,
  label,
  token,
}: {
  href: string;
  label: string;
  token: TokenListItem;
}) {
  return (
    <Link
      href={href}
      className="panel-interactive flex min-w-0 flex-col gap-2 p-2.5 md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-3 md:px-3 md:py-3"
    >
      <p className="section-label shrink-0 text-[10px] md:text-[inherit]">{label}</p>
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <TokenAvatar address={token.address} symbol={token.symbol} logoUrl={token.logoUrl} size={22} className="md:hidden" />
        <TokenAvatar address={token.address} symbol={token.symbol} logoUrl={token.logoUrl} size={18} className="hidden md:block" />
        <p className="truncate text-caption font-medium text-pump-text">${token.symbol}</p>
      </div>
    </Link>
  );
}

function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

function formatDurationSince(iso: string | null): string {
  if (!iso) return "—";
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "—";
  const min = Math.floor(elapsed / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatCount(value: number | null | undefined): string {
  const n = value ?? 0;
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return String(n);
}

function TrendSparkline({
  points,
  positive,
}: {
  points: number[];
  positive: boolean;
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1e-9);
  const poly = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * 56;
      const y = 18 - ((p - min) / range) * 16;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 56 20" aria-hidden className="h-5 w-14">
      <polyline
        points={poly}
        fill="none"
        stroke={positive ? "rgb(56 197 129)" : "rgb(227 95 95)"}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const KOTH_CONTENDER_RANK = 5;

function matchesBoardFilter(
  token: TokenListItem,
  filter: BoardFilter,
  favorites: Set<string>,
  kothContenderAddresses: Set<string>
): boolean {
  if (filter === "new") {
    return true;
  }
  if (filter === "highVol") {
    return Number(token.volume24hBnb ?? 0) >= 0.5;
  }
  if (filter === "movers") {
    return Math.abs(token.change24hPct ?? 0) >= 1;
  }
  if (filter === "kothContenders") {
    return kothContenderAddresses.has(token.address.toLowerCase());
  }
  if (filter === "favorites") {
    return favorites.has(token.address.toLowerCase());
  }
  return true;
}

export function ArenaListClient() {
  const [tokens, setTokens] = useState<TokenListItem[] | null>(null);
  const [kothSummary, setKothSummary] = useState<KothSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashes, setFlashes] = useState<Record<string, FlashTone>>({});
  const [animatedCaps, setAnimatedCaps] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<BoardFilter>("new");
  const [sortKey, setSortKey] = useState<SortKey>("mcap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { bnbUsd } = useBnbUsdPrice();
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const capAnimFrameRef = useRef<Record<string, number>>({});
  const animatedCapsRef = useRef<Record<string, number>>({});
  const mobileListRef = useRef<HTMLDivElement>(null);

  const triggerFlash = useCallback((key: string, toneValue: FlashTone) => {
    setFlashes((prev) => ({ ...prev, [key]: toneValue }));
    const existing = flashTimersRef.current[key];
    if (existing) clearTimeout(existing);
    flashTimersRef.current[key] = setTimeout(() => {
      setFlashes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete flashTimersRef.current[key];
    }, 700);
  }, []);

  const setAnimatedCap = useCallback((key: string, value: number) => {
    animatedCapsRef.current[key] = value;
    setAnimatedCaps((prev) => ({ ...prev, [key]: value }));
  }, []);

  const animateCap = useCallback(
    (key: string, to: number) => {
      const from = animatedCapsRef.current[key];
      if (from == null || !Number.isFinite(from) || !Number.isFinite(to)) {
        setAnimatedCap(key, to);
        return;
      }
      if (Math.abs(to - from) < 1e-9) return;

      const existing = capAnimFrameRef.current[key];
      if (existing) cancelAnimationFrame(existing);

      const startedAt = performance.now();
      const duration = 1000;
      const step = (now: number) => {
        const p = Math.min(1, (now - startedAt) / duration);
        const next = from + (to - from) * p;
        setAnimatedCap(key, next);
        if (p < 1) {
          capAnimFrameRef.current[key] = requestAnimationFrame(step);
        } else {
          delete capAnimFrameRef.current[key];
        }
      };
      capAnimFrameRef.current[key] = requestAnimationFrame(step);
    },
    [setAnimatedCap]
  );

  const getComparableValues = useCallback((token: TokenListItem) => {
    return {
      mcap: Number(token.marketCapBnb),
      ath: Number(token.athMarketCapBnb ?? token.marketCapBnb),
      txns: token.tradeCount ?? 0,
      vol24h: Number(token.volume24hBnb ?? 0),
      traders: token.traders24h ?? 0,
      h1: token.change1hPct ?? null,
      h6: token.change6hPct ?? null,
      h24: token.change24hPct ?? null,
    } as const;
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/tokens", { cache: "no-store" });
      const body = (await response.json()) as {
        data?: TokenListItem[];
        koth?: KothSummary | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load tokens");
      }

      const nextTokens = body.data ?? [];
      setKothSummary(body.koth ?? null);
      setTokens((prev) => {
        if (!prev) return nextTokens;
        const prevByAddress = new Map(prev.map((t) => [t.address.toLowerCase(), t]));
        for (const token of nextTokens) {
          const oldToken = prevByAddress.get(token.address.toLowerCase());
          if (!oldToken) continue;

          const prevValues = getComparableValues(oldToken);
          const nextValues = getComparableValues(token);
          const entries = Object.entries(nextValues) as Array<[keyof typeof nextValues, number | null]>;

          for (const [field, nextValue] of entries) {
            if (field === "h1" || field === "h6" || field === "h24") continue;
            const prevValue = prevValues[field];
            if (nextValue == null || prevValue == null) continue;
            if (!Number.isFinite(nextValue) || !Number.isFinite(prevValue)) continue;
            if (nextValue === prevValue) continue;
            triggerFlash(
              `${token.address.toLowerCase()}:${String(field)}`,
              nextValue > prevValue ? "up" : "down"
            );
          }
        }
        return nextTokens;
      });
      setError(null);
    } catch (err) {
      setTokens(null);
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    }
  }, [getComparableValues, triggerFlash]);

  const loadRef = useRef(load);
  loadRef.current = load;

  const { connected: wsConnected } = useLiveChannel({
    room: "arena",
    onMessage: (message) => {
      const payload = message as { type?: string };
      if (
        payload.type === "trade" ||
        payload.type === "board_delta" ||
        payload.type === "koth"
      ) {
        void loadRef.current();
      }
    },
  });

  useEffect(() => {
    void load();
    let timer: number | null = null;

    const schedule = () => {
      const delay = resolveLivePollDelay(wsConnected, false);
      timer = window.setTimeout(() => {
        void load().finally(schedule);
      }, delay);
    };

    schedule();

    return () => {
      if (timer) window.clearTimeout(timer);
      const timers = Object.values(flashTimersRef.current);
      for (const t of timers) clearTimeout(t);
      flashTimersRef.current = {};
      const frames = Object.values(capAnimFrameRef.current);
      for (const frame of frames) cancelAnimationFrame(frame);
      capAnimFrameRef.current = {};
    };
  }, [load, wsConnected]);

  useEffect(() => {
    if (!tokens) return;

    for (const token of tokens) {
      const address = token.address.toLowerCase();
      const mcapTarget = bnbToUsd(Number(token.marketCapBnb), bnbUsd);
      const athTarget = bnbToUsd(Number(token.athMarketCapBnb ?? token.marketCapBnb), bnbUsd);
      const vol24hTarget = bnbToUsd(Number(token.volume24hBnb ?? 0), bnbUsd);

      if (mcapTarget != null && Number.isFinite(mcapTarget)) {
        const key = `${address}:cap:mcap`;
        if (animatedCapsRef.current[key] == null) setAnimatedCap(key, mcapTarget);
        else animateCap(key, mcapTarget);
      }
      if (athTarget != null && Number.isFinite(athTarget)) {
        const key = `${address}:cap:ath`;
        if (animatedCapsRef.current[key] == null) setAnimatedCap(key, athTarget);
        else animateCap(key, athTarget);
      }
      if (vol24hTarget != null && Number.isFinite(vol24hTarget)) {
        const key = `${address}:cap:vol24h`;
        if (animatedCapsRef.current[key] == null) setAnimatedCap(key, vol24hTarget);
        else animateCap(key, vol24hTarget);
      }
    }
  }, [tokens, bnbUsd, animateCap, setAnimatedCap]);

  const resolvedTokens = tokens ?? [];
  const mcapRankedTokens = useMemo(
    () =>
      [...resolvedTokens].sort(
        (a, b) => Number(b.marketCapBnb ?? 0) - Number(a.marketCapBnb ?? 0)
      ),
    [resolvedTokens]
  );
  const kothToken = mcapRankedTokens[0] ?? null;
  const kothContenderAddresses = useMemo(
    () =>
      new Set(
        mcapRankedTokens
          .slice(0, KOTH_CONTENDER_RANK)
          .map((token) => token.address.toLowerCase())
      ),
    [mcapRankedTokens]
  );
  const kothCrownedAt = useMemo(() => {
    const activeAddress = kothSummary?.activeTokenAddress?.toLowerCase();
    if (!kothToken || !activeAddress) return null;
    if (activeAddress !== kothToken.address.toLowerCase()) return null;
    return kothSummary?.crownedAt ?? null;
  }, [kothSummary, kothToken]);

  const topGainer24h = useMemo(
    () =>
      [...resolvedTokens]
        .filter((t) => t.change24hPct != null)
        .sort((a, b) => (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity))[0] ?? null,
    [resolvedTokens]
  );
  const topVolume24h = useMemo(
    () =>
      [...resolvedTokens].sort(
        (a, b) => Number(b.volume24hBnb ?? 0) - Number(a.volume24hBnb ?? 0)
      )[0] ?? null,
    [resolvedTokens]
  );
  const mostTrades = useMemo(
    () =>
      [...resolvedTokens].sort((a, b) => (b.tradeCount ?? 0) - (a.tradeCount ?? 0))[0] ?? null,
    [resolvedTokens]
  );

  const marketTokens = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    const filtered = resolvedTokens.filter((token) => {
      if (
        searchTerm &&
        !token.name.toLowerCase().includes(searchTerm) &&
        !token.symbol.toLowerCase().includes(searchTerm)
      ) {
        return false;
      }
      return matchesBoardFilter(token, activeFilter, favorites, kothContenderAddresses);
    });

    const withMetrics = filtered.map((token) => {
      const mcapUsd = bnbToUsd(Number(token.marketCapBnb), bnbUsd) ?? 0;
      const athUsd = bnbToUsd(Number(token.athMarketCapBnb ?? token.marketCapBnb), bnbUsd) ?? 0;
      const volUsd = bnbToUsd(Number(token.volume24hBnb ?? 0), bnbUsd) ?? 0;
      return {
        token,
        metric: {
          mcap: mcapUsd,
          ath: athUsd,
          age: new Date(token.createdAt).getTime(),
          txns: token.tradeCount ?? 0,
          vol24h: volUsd,
          traders: token.traders24h ?? 0,
          h1: token.change1hPct ?? 0,
          h6: token.change6hPct ?? 0,
          h24: token.change24hPct ?? 0,
        },
      };
    });

    const boardSortKey: SortKey = activeFilter === "new" ? "age" : sortKey;
    const boardSortDir: SortDir = activeFilter === "new" ? "desc" : sortDir;

    withMetrics.sort((a, b) => {
      const av = a.metric[boardSortKey];
      const bv = b.metric[boardSortKey];
      const delta = av - bv;
      return boardSortDir === "asc" ? delta : -delta;
    });

    return withMetrics.map((entry) => entry.token);
  }, [
    resolvedTokens,
    search,
    activeFilter,
    favorites,
    sortKey,
    sortDir,
    bnbUsd,
    kothContenderAddresses,
  ]);

  const boardKeys = useMemo(
    () => marketTokens.map((token) => token.address.toLowerCase()),
    [marketTokens]
  );
  const boardResetKey = `${activeFilter}|${sortKey}|${sortDir}|${search.trim().toLowerCase()}`;
  const { rowClass: boardRowClass, rankClass: boardRankClass } = useLiveBoardAnimations(
    boardKeys,
    { flipContainerRef: mobileListRef, resetKey: boardResetKey }
  );

  const filterCounts = useMemo(() => {
    const all = resolvedTokens.length;
    const newCount = resolvedTokens.filter((token) =>
      matchesBoardFilter(token, "new", favorites, kothContenderAddresses)
    ).length;
    const highVol = resolvedTokens.filter((token) =>
      matchesBoardFilter(token, "highVol", favorites, kothContenderAddresses)
    ).length;
    const movers = resolvedTokens.filter((token) =>
      matchesBoardFilter(token, "movers", favorites, kothContenderAddresses)
    ).length;
    const contenders = resolvedTokens.filter((token) =>
      matchesBoardFilter(token, "kothContenders", favorites, kothContenderAddresses)
    ).length;
    const favs = resolvedTokens.filter((token) =>
      matchesBoardFilter(token, "favorites", favorites, kothContenderAddresses)
    ).length;
    return {
      all,
      new: newCount,
      highVol,
      movers,
      kothContenders: contenders,
      favorites: favs,
    };
  }, [resolvedTokens, favorites, kothContenderAddresses]);

  function onSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("desc");
  }

  const boardSortKey: SortKey = activeFilter === "new" ? "age" : sortKey;
  const boardSortDir: SortDir = activeFilter === "new" ? "desc" : sortDir;

  const sortLabel = (key: SortKey) =>
    boardSortKey === key ? `${boardSortDir === "asc" ? "↑" : "↓"}` : "";
  const sortHeadClass = (key: SortKey) =>
    `inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition ${
      boardSortKey === key
        ? "text-pump-accent"
        : "text-pump-muted hover:text-pump-text"
    }`;

  if (tokens === null && !error) {
    return <ArenaSkeleton />;
  }

  if (error) {
    return (
      <div className="notice-error p-4">
        {error}
      </div>
    );
  }

  if (resolvedTokens.length === 0) {
    return (
      <div className="panel-surface p-6 text-center text-pump-muted">
        No tokens yet. Be the first to launch a meme.
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {kothToken ? (
        <section className="space-y-2 md:space-y-3">
          <Link
            href={`/token/${kothToken.address}`}
            className="block panel-surface p-3 transition hover:bg-pump-border/6 md:p-4"
          >
            <div className="flex items-start justify-between gap-2 md:gap-4">
              <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
                <TokenAvatar
                  address={kothToken.address}
                  symbol={kothToken.symbol}
                  logoUrl={kothToken.logoUrl}
                  size={38}
                  className="md:hidden"
                />
                <TokenAvatar
                  address={kothToken.address}
                  symbol={kothToken.symbol}
                  logoUrl={kothToken.logoUrl}
                  size={46}
                  className="hidden md:block"
                />
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-pump-text md:card-title">
                    {kothToken.name}
                  </p>
                  <p className="text-caption text-pump-muted">${kothToken.symbol}</p>
                </div>
              </div>
              <span className="status-badge shrink-0 text-[10px] md:text-[inherit]">Live leader</span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 md:mt-4 md:grid-cols-3 md:gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="section-label whitespace-nowrap text-[10px] md:hidden">MCAP</dt>
                <dd className="m-0 border border-pump-border/45 bg-pump-border/4 px-3 py-2 md:flex md:flex-nowrap md:items-center md:justify-between md:gap-2">
                  <span className="section-label hidden shrink-0 whitespace-nowrap md:inline">MCAP</span>
                  <MetricValueWith24hChange
                    compact
                    value={formatCapForBoard(bnbToUsd(Number(kothToken.marketCapBnb), bnbUsd))}
                    changePct={kothToken.change24hPct ?? null}
                  />
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="section-label whitespace-nowrap text-[10px] md:hidden">24H VOL</dt>
                <dd className="m-0 border border-pump-border/45 bg-pump-border/4 px-3 py-2 md:flex md:flex-nowrap md:items-center md:justify-between md:gap-2">
                  <span className="section-label hidden shrink-0 whitespace-nowrap md:inline">24H VOL</span>
                  <MetricValueWith24hChange
                    compact
                    value={formatUsdReadable(
                      bnbToUsd(Number(kothToken.volume24hBnb ?? 0), bnbUsd),
                      { compact: true }
                    )}
                    changePct={
                      kothToken.change24hVolPct ?? kothToken.change24hPct ?? null
                    }
                  />
                </dd>
              </div>
              <div className="hidden min-w-0 md:block">
                <dd className="m-0 border border-pump-border/45 bg-pump-border/4 px-3 py-2 md:flex md:flex-nowrap md:items-center md:justify-between md:gap-2">
                  <span className="section-label shrink-0 whitespace-nowrap">TIME AS KING</span>
                  <span className="financial-value shrink-0 text-body-sm font-semibold text-pump-text">
                    {formatDurationSince(kothCrownedAt)}
                  </span>
                </dd>
              </div>
            </dl>
          </Link>

          {kothSummary?.recent?.length ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible">
              <span className="section-label shrink-0 text-[10px] md:text-[inherit]">Recent</span>
              {kothSummary.recent.slice(0, 4).map((item) => (
                <Link
                  key={`${item.tokenAddress}:${item.crownedAt}`}
                  href={`/token/${item.tokenAddress}`}
                  className="inline-flex shrink-0 items-center gap-1.5 border border-pump-border/45 bg-pump-border/4 px-2 py-0.5 text-caption text-pump-muted hover:text-pump-text md:gap-2 md:px-2.5 md:py-1"
                >
                  <TokenAvatar
                    address={item.tokenAddress}
                    symbol={item.symbol}
                    logoUrl={item.logoUrl}
                    size={16}
                    className="md:hidden"
                  />
                  <TokenAvatar
                    address={item.tokenAddress}
                    symbol={item.symbol}
                    logoUrl={item.logoUrl}
                    size={18}
                    className="hidden md:block"
                  />
                  <span className="text-caption text-pump-text">${item.symbol}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid-cols-3 gap-2 md:gap-3">
        {topGainer24h ? (
          <HighlightStatCard
            href={`/token/${topGainer24h.address}`}
            label="Top gainer"
            token={topGainer24h}
          />
        ) : (
          <div className="panel-surface flex flex-col gap-2 p-2.5 md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-3 md:px-3 md:py-3">
            <p className="section-label shrink-0 text-[10px] md:text-[inherit]">Top gainer</p>
            <p className="shrink-0 text-body-sm text-pump-muted md:mt-0 md:text-right">—</p>
          </div>
        )}

        {topVolume24h ? (
          <HighlightStatCard
            href={`/token/${topVolume24h.address}`}
            label="Top volume"
            token={topVolume24h}
          />
        ) : (
          <div className="panel-surface flex flex-col gap-2 p-2.5 md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-3 md:px-3 md:py-3">
            <p className="section-label shrink-0 text-[10px] md:text-[inherit]">Top volume</p>
            <p className="shrink-0 text-body-sm text-pump-muted md:mt-0 md:text-right">—</p>
          </div>
        )}

        {mostTrades ? (
          <HighlightStatCard
            href={`/token/${mostTrades.address}`}
            label="Most trades"
            token={mostTrades}
          />
        ) : (
          <div className="panel-surface flex flex-col gap-2 p-2.5 md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-3 md:px-3 md:py-3">
            <p className="section-label shrink-0 text-[10px] md:text-[inherit]">Most trades</p>
            <p className="shrink-0 text-body-sm text-pump-muted md:mt-0 md:text-right">—</p>
          </div>
        )}
      </section>

      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-heading">Explore coins</h2>
          <Link
            href="/create"
            prefetch={true}
            className="toolbar-btn toolbar-btn-accent shrink-0 md:hidden"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 shrink-0 fill-none stroke-current">
              <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Create
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coin or symbol"
            className="field-input h-9 w-full bg-pump-surface/75 md:max-w-xs"
          />
          <div className="sheet-tabs -mx-2 overflow-x-auto px-2 md:mx-0 md:px-0">
          {(
            [
              ["new", "New", "Newest"],
              ["all", "All", "All"],
              ["highVol", "Vol", "High Vol"],
              ["movers", "Movers", "Movers"],
              ["kothContenders", "KOTH", "KOTH contenders"],
              ["favorites", "Favorites", "Favorites"],
            ] as const
          ).map(([key, mobileLabel, desktopLabel]) => {
            const count = filterCounts[key] ?? 0;
            const isFavorites = key === "favorites";
            return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter(key)}
              className={`shrink-0 max-md:px-2.5 max-md:py-1.5 ${
                activeFilter === key ? "chip-button chip-button-active" : "chip-button"
              }`}
            >
              {isFavorites ? (
                <>
                  <span className="inline-flex items-center gap-1 md:hidden">
                    <span className="text-lg leading-none">★</span>
                    <span>({count})</span>
                  </span>
                  <span className="hidden md:inline">
                    {desktopLabel} ({count})
                  </span>
                </>
              ) : (
                <>
                  <span className="md:hidden">
                    {mobileLabel} ({count})
                  </span>
                  <span className="hidden md:inline">
                    {desktopLabel} ({count})
                  </span>
                </>
              )}
            </button>
            );
          })}
          </div>
        </div>

        <section className="panel-surface overflow-hidden">
        <div ref={mobileListRef} className="sheet-list lg:hidden">
          {marketTokens.map((token, index) => {
            const addressKey = token.address.toLowerCase();
            const mcapUsd =
              animatedCaps[`${addressKey}:cap:mcap`] ??
              bnbToUsd(Number(token.marketCapBnb), bnbUsd);
            const vol24hUsd =
              animatedCaps[`${addressKey}:cap:vol24h`] ??
              bnbToUsd(Number(token.volume24hBnb ?? 0), bnbUsd);
            return (
              <article
                key={token.address}
                data-board-key={addressKey}
                className={`grid grid-cols-[0.875rem_1.75rem_1fr_auto] gap-x-2 gap-y-2 p-2.5 md:p-3 ${boardRowClass(addressKey)}`}
              >
                <span
                  className={`financial-value self-center text-[10px] text-pump-muted ${boardRankClass(addressKey)}`}
                >
                  {index + 1}
                </span>
                <TokenAvatar
                  address={token.address}
                  symbol={token.symbol}
                  logoUrl={token.logoUrl}
                  size={28}
                  className="row-span-2 self-start"
                />
                <Link
                  href={`/token/${token.address}`}
                  className="flex min-w-0 items-baseline gap-2 self-center"
                >
                  <p className="truncate text-body-sm font-medium text-pump-text">{token.name}</p>
                  <p className="shrink-0 text-caption text-pump-muted">${token.symbol}</p>
                </Link>
                <button
                  type="button"
                  onClick={() => toggleFavorite(token.address)}
                  className={`self-center text-xl leading-none transition ${
                    isFavorite(token.address)
                      ? "text-pump-accent"
                      : "text-pump-muted hover:text-pump-text"
                  }`}
                  aria-label="Toggle favorite"
                >
                  {isFavorite(token.address) ? "★" : "☆"}
                </button>
                <div className="col-span-3 col-start-2 flex w-full items-center justify-between gap-1 text-[11px] leading-tight">
                  <span className={`financial-value min-w-0 truncate ${flashText(flashes[`${addressKey}:mcap`])}`}>
                    <span className="text-pump-muted">MCAP </span>
                    {formatCapForBoard(mcapUsd)}
                  </span>
                  <span className={`financial-value min-w-0 truncate ${flashText(flashes[`${addressKey}:vol24h`])}`}>
                    <span className="text-pump-muted">VOL </span>
                    {formatUsdReadable(vol24hUsd, { compact: true })}
                  </span>
                  <span className={`financial-value min-w-0 truncate ${flashText(flashes[`${addressKey}:txns`])}`}>
                    <span className="text-pump-muted">TXN </span>
                    {token.tradeCount ?? 0}
                  </span>
                  <span className="financial-value shrink-0 text-right">
                    <span className="text-pump-muted">24H </span>
                    <span className={pctTone(token.change24hPct ?? null)}>
                      {formatSignedPct(token.change24hPct ?? null)}
                    </span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="sheet-grid min-w-[1180px]">
          <thead>
            <tr>
              <th />
              <th>Coin</th>
              <th>Graph</th>
              <th><button type="button" onClick={() => onSort("mcap")} className={sortHeadClass("mcap")}>MCAP {sortLabel("mcap")}</button></th>
              <th><button type="button" onClick={() => onSort("ath")} className={sortHeadClass("ath")}>ATH {sortLabel("ath")}</button></th>
              <th><button type="button" onClick={() => onSort("age")} className={sortHeadClass("age")}>Age {sortLabel("age")}</button></th>
              <th><button type="button" onClick={() => onSort("txns")} className={sortHeadClass("txns")}>TXNS {sortLabel("txns")}</button></th>
              <th><button type="button" onClick={() => onSort("vol24h")} className={sortHeadClass("vol24h")}>24H VOL {sortLabel("vol24h")}</button></th>
              <th><button type="button" onClick={() => onSort("traders")} className={sortHeadClass("traders")}>TRADERS {sortLabel("traders")}</button></th>
              <th><button type="button" onClick={() => onSort("h1")} className={sortHeadClass("h1")}>1H {sortLabel("h1")}</button></th>
              <th><button type="button" onClick={() => onSort("h6")} className={sortHeadClass("h6")}>6H {sortLabel("h6")}</button></th>
              <th><button type="button" onClick={() => onSort("h24")} className={sortHeadClass("h24")}>24H {sortLabel("h24")}</button></th>
            </tr>
          </thead>
          <tbody>
            {marketTokens.map((token, index) => {
              const addressKey = token.address.toLowerCase();
              const mcapUsd =
                animatedCaps[`${addressKey}:cap:mcap`] ??
                bnbToUsd(Number(token.marketCapBnb), bnbUsd);
              const athMcapUsd =
                animatedCaps[`${addressKey}:cap:ath`] ??
                bnbToUsd(Number(token.athMarketCapBnb ?? token.marketCapBnb), bnbUsd);
              const vol24hUsd =
                animatedCaps[`${addressKey}:cap:vol24h`] ??
                bnbToUsd(Number(token.volume24hBnb ?? 0), bnbUsd);
              const trendPoints = [
                token.change24hPct ?? 0,
                token.change6hPct ?? 0,
                token.change1hPct ?? 0,
                0,
              ];
              const trendPositive = (token.change24hPct ?? 0) >= 0;
              return (
                <tr key={token.address} data-board-key={addressKey} className={boardRowClass(addressKey)}>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(token.address)}
                      className={`text-xl leading-none transition ${
                        isFavorite(token.address)
                          ? "text-pump-accent"
                          : "text-pump-muted hover:text-pump-text"
                      }`}
                      aria-label="Toggle favorite"
                    >
                      {isFavorite(token.address) ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/token/${token.address}`} className="flex min-w-0 items-center gap-3">
                      <span
                        className={`financial-value w-4 text-caption text-pump-muted ${boardRankClass(addressKey)}`}
                      >
                        {index + 1}
                      </span>
                      <TokenAvatar
                        address={token.address}
                        symbol={token.symbol}
                        logoUrl={token.logoUrl}
                        size={30}
                      />
                      <div className="flex min-w-0 items-baseline gap-2">
                        <p className="truncate text-body-sm font-medium text-pump-text">{token.name}</p>
                        <p className="shrink-0 text-caption text-pump-muted">${token.symbol}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <TrendSparkline points={trendPoints} positive={trendPositive} />
                  </td>
                  <td
                    className={`px-4 py-3 financial-value font-semibold ${flashText(
                      flashes[`${token.address.toLowerCase()}:mcap`]
                    )}`}
                  >
                    {formatCapForBoard(mcapUsd)}
                  </td>
                  <td
                    className={`px-4 py-3 ${flashText(
                      flashes[`${token.address.toLowerCase()}:ath`]
                    )}`}
                  >
                    <p className="financial-value">
                      {formatCapForBoard(athMcapUsd)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-pump-text">{formatAge(token.createdAt)}</td>
                  <td
                    className={`px-4 py-3 financial-value ${flashText(
                      flashes[`${token.address.toLowerCase()}:txns`]
                    )}`}
                  >
                    {token.tradeCount ?? 0}
                  </td>
                  <td
                    className={`px-4 py-3 financial-value ${flashText(
                      flashes[`${token.address.toLowerCase()}:vol24h`]
                    )}`}
                  >
                    {formatUsdReadable(vol24hUsd, { compact: true })}
                  </td>
                  <td
                    className={`px-4 py-3 financial-value ${flashText(
                      flashes[`${token.address.toLowerCase()}:traders`]
                    )}`}
                  >
                    {token.traders24h ?? 0}
                  </td>
                  <td className={`px-4 py-3 financial-value ${pctTone(token.change1hPct ?? null)}`}>
                    {formatSignedPct(token.change1hPct ?? null)}
                  </td>
                  <td className={`px-4 py-3 financial-value ${pctTone(token.change6hPct ?? null)}`}>
                    {formatSignedPct(token.change6hPct ?? null)}
                  </td>
                  <td className={`px-4 py-3 financial-value ${pctTone(token.change24hPct ?? null)}`}>
                    {formatSignedPct(token.change24hPct ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        </section>
      </div>
    </div>
  );
}

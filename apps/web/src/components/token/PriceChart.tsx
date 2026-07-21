"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  createChart,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import { PumpIcon } from "@/components/icons/PumpIcon";
import { faChevronDown } from "@/lib/pump-icons";
import {
  applyCandleSeriesPriceFormat,
  buildCandlesFromTrades,
  CANDLE_INTERVALS,
  DEFAULT_CHART_INTERVAL,
  createOptimisticCandleBar,
  resolveChartPriceFormat,
  seriesHasTemporalGaps,
  type ActorOptimisticChartSpot,
  type CandleBar,
  type CandleInterval,
  type CandleWsUpdate,
  type VolumeBar,
} from "@/lib/candles";
import {
  candleToMainChartPoint,
  candlesToMainChartData,
  CHART_DISPLAY_STYLE_OPTIONS,
  chartDisplayStyleIcon,
  createMainChartSeries,
  readChartDisplayStyle,
  resolveChartSeriesColors,
  writeChartDisplayStyle,
  type ChartDisplayStyle,
} from "@/lib/chart-display-style";
import type { TradeItem } from "@/lib/db/launchpad";
import type { InitialChartCandles } from "@/lib/token-server";
import {
  canSafeIncrementalUpdate,
  chartSeriesReducer,
  deriveChartSeries,
  incrementalPatchStartIndex,
  initialChartSeriesState,
  needsFullCandleResync,
  type ActorBucketExtremes,
} from "@/lib/chart-series-state";
import {
  logChartFetchComplete,
  logChartWsLag,
  markChartFetchStart,
} from "@/lib/chart-observability";
import type { BondingCurveSnapshot } from "@/lib/bonding-curve";
import { useTheme } from "@/components/theme/ThemeProvider";
import { DEFAULT_TOKEN_TOTAL_SUPPLY } from "@/lib/format-usd";

type PriceChartProps = {
  tokenAddress: string;
  symbol: string;
  status: string;
  /** SSR seed from token bundle (default 5m). */
  initialCandles?: InitialChartCandles;
  /** Trader-only optimistic bucket (other viewers rely on WS). */
  actorOptimisticSpot?: ActorOptimisticChartSpot | null;
  /** Cumulative sell/buy wicks in the active bucket until indexer confirms. */
  actorBucketExtremes?: ActorBucketExtremes | null;
  /** On-chain virtual reserves for spot replay fallback (pre-backfill). */
  curveSnapshot?: BondingCurveSnapshot;
  /** WS candle buckets from indexer (db source). */
  liveCandleUpdates?: CandleWsUpdate[];
  /** Tape trades (DB + optimistic) — chart fallback before indexer candles land. */
  fallbackTrades?: TradeItem[];
  wsConnected?: boolean;
  bnbUsd?: number | null;
  /** Live on-chain bonding spot (native) — chart tail. */
  liveOnChainSpotBnb?: number | null;
  /** Fill parent flex slot (token detail fixed viewport). */
  fillContainer?: boolean;
  /** Controlled USD / MCAP axis — syncs with mobile hero quote when lifted. */
  currency?: "usd" | "mcap";
  onCurrencyChange?: (currency: "usd" | "mcap") => void;
};

const POLL_MS = 4_000;
const WS_FALLBACK_POLL_MS = 30_000;
const DEFAULT_VISIBLE_CANDLES = 120;
/** Minimum Y-axis span so micro-cap moves don't fill the entire chart height. */
const MIN_CHART_PRICE_RANGE_RATIO = 0.04;

function chartAutoscaleInfoProvider(
  original: () => { priceRange: { minValue: number; maxValue: number } } | null
) {
  const info = original();
  if (!info) return info;
  const { minValue, maxValue } = info.priceRange;
  const mid = (minValue + maxValue) / 2;
  if (!Number.isFinite(mid) || mid <= 0) return info;
  const span = maxValue - minValue;
  const minSpan = mid * MIN_CHART_PRICE_RANGE_RATIO;
  if (span >= minSpan) return info;
  const half = minSpan / 2;
  return {
    priceRange: {
      minValue: Math.max(0, mid - half),
      maxValue: mid + half,
    },
  };
}

function shouldUseLogPriceScale(
  candles: CandleBar[],
  currency: "usd" | "mcap" = "usd"
): boolean {
  if (currency === "mcap") return false;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const c of candles) {
    if (c.low > 0) min = Math.min(min, c.low);
    max = Math.max(max, c.high, c.close);
  }
  if (!Number.isFinite(min) || min <= 0 || max <= 0) return false;
  return max / min >= 1.5;
}

/** Anchor viewport on the latest candles (live edge). */
function visibleLogicalRange(
  candles: CandleBar[],
  maxVisible: number
): { from: number; to: number } {
  const count = candles.length;
  if (count === 0) return { from: 0, to: 5 };
  const to = count + 8;
  const from = Math.max(0, count - maxVisible);
  return { from, to };
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function chartHeightPx(): number {
  if (typeof window === "undefined") return 400;
  if (window.innerWidth >= 1024) return 460;
  if (window.innerWidth >= 768) return 400;
  return 280;
}

function resolveChartHeight(el: HTMLElement | null, fillContainer: boolean): number {
  if (fillContainer && el) {
    // Collapsed split pane — keep LWC alive with a 1px canvas (ResizeObserver restores size).
    return Math.max(1, el.clientHeight);
  }
  return chartHeightPx();
}

/** LWC canvas axis — desktop uses body-sm scale (15px), mobile slightly smaller. */
function resolveChartAxisFontSize(): number {
  if (typeof window === "undefined") return 15;
  return window.matchMedia("(min-width: 768px)").matches ? 15 : 13;
}

/** Mobile token terminal — hide bottom time labels (Hyperliquid-style). */
function isMobileChartViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

function formatLocalChartTime(time: Time, showSeconds = false): string {
  if (typeof time !== "number") return "";
  const d = new Date(time * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: showSeconds ? "2-digit" : undefined,
    hour12: false,
  });
}

function formatLocalChartTick(time: Time, showSeconds: boolean): string {
  if (typeof time !== "number") return "";
  const d = new Date(time * 1000);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  if (!showSeconds) return `${hh}:${mm}`;
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** True when we can patch tail buckets with series.update() instead of setData(). */
function canIncrementalChartPatch(prev: CandleBar[], next: CandleBar[]): boolean {
  return canSafeIncrementalUpdate(prev, next);
}

export function PriceChart({
  tokenAddress,
  symbol: _symbol,
  status: _status,
  initialCandles,
  actorOptimisticSpot = null,
  actorBucketExtremes = null,
  curveSnapshot,
  liveCandleUpdates = [],
  fallbackTrades = [],
  wsConnected = false,
  bnbUsd = null,
  liveOnChainSpotBnb = null,
  fillContainer = false,
  currency: currencyProp,
  onCurrencyChange,
}: PriceChartProps) {
  const { theme } = useTheme();
  const [hideTimeAxis, setHideTimeAxis] = useState(isMobileChartViewport);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  /** Fit viewport only on first paint or interval/currency change — not every poll. */
  const shouldFitViewportRef = useRef(true);
  const lastTradeBucketCountRef = useRef(0);
  const prevPriceScaleRef = useRef<number | null>(null);
  const renderedCandlesRef = useRef<CandleBar[]>([]);
  const renderedFingerprintRef = useRef("");
  const chartStyleRef = useRef<ChartDisplayStyle>("candles");

  const [timeInterval, setTimeInterval] = useState<CandleInterval>(DEFAULT_CHART_INTERVAL);
  const [internalCurrency, setInternalCurrency] = useState<"usd" | "mcap">("mcap");
  const currency = currencyProp ?? internalCurrency;
  const [chartStyle, setChartStyle] = useState<ChartDisplayStyle>("candles");
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [seriesState, dispatchSeries] = useReducer(chartSeriesReducer, initialChartSeriesState);
  const [loading, setLoading] = useState(() => !initialCandles?.candles.length);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

  chartStyleRef.current = chartStyle;

  useEffect(() => {
    setChartStyle(readChartDisplayStyle());
  }, []);

  const frozen = false;
  /** Series values: BNB spot (usd) or BNB mcap — USD only in formatters. */
  const candleUnitScale =
    currency === "mcap" ? DEFAULT_TOKEN_TOTAL_SUPPLY : 1;

  const fetchCandles = useCallback(async () => {
    const intervalAtFetch = timeInterval;
    const mark = markChartFetchStart(tokenAddress, intervalAtFetch);
    const startedAt = Date.now();
    try {
      const res = await fetch(
        `/api/tokens/${tokenAddress}/candles?interval=${intervalAtFetch}&limit=1000`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to load chart candles");
      const body = (await res.json()) as {
        data?: {
          candles?: CandleBar[];
          volumes?: VolumeBar[];
          source?: "db" | "trades";
          gapFilled?: boolean;
          gapFill?: "sql" | "ts" | "none";
        };
      };
      const candles = body.data?.candles ?? [];
      const volumes = body.data?.volumes ?? [];
      dispatchSeries({
        type: "set_fetched",
        candles,
        volumes,
        source: body.data?.source ?? "trades",
        interval: intervalAtFetch,
        gapFilledByApi: body.data?.gapFilled ?? false,
      });
      if (typeof performance !== "undefined") {
        performance.mark(`${mark}_end`);
      }
      logChartFetchComplete({
        mark,
        tokenAddress,
        interval: intervalAtFetch,
        source: body.data?.source ?? "trades",
        durationMs: Date.now() - startedAt,
        bucketCount: candles.length,
        gapFill: body.data?.gapFill ?? "none",
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chart load failed");
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, timeInterval]);

  useEffect(() => {
    if (
      initialCandles &&
      initialCandles.interval === timeInterval &&
      initialCandles.candles.length > 0 &&
      seriesState.candles.length === 0
    ) {
      dispatchSeries({
        type: "set_fetched",
        candles: initialCandles.candles,
        volumes: initialCandles.volumes,
        source: initialCandles.source,
        interval: initialCandles.interval,
        gapFilledByApi: initialCandles.gapFilledByApi,
      });
      setLoading(false);
    }
  }, [initialCandles, seriesState.candles.length, timeInterval]);

  useEffect(() => {
    dispatchSeries({ type: "reset" });
    shouldFitViewportRef.current = true;
    renderedCandlesRef.current = [];
    renderedFingerprintRef.current = "";
    setLoading(true);
    void fetchCandles();
  }, [fetchCandles, tokenAddress]);

  useEffect(() => {
    if (frozen) return;
    const pollMs = wsConnected ? WS_FALLBACK_POLL_MS : POLL_MS;
    const timer = setInterval(() => void fetchCandles(), pollMs);
    return () => clearInterval(timer);
  }, [fetchCandles, frozen, wsConnected]);

  // When the actor (the trader on this page) submits a buy/sell, give INSTANT visual feedback on the chart.
  // This follows the professional pattern: acting user sees optimistic candle update immediately via direct series.update(),
  // while other viewers wait for the indexer WS. We still keep actor in derive for full rebuilds.
  const lastOptimisticSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!actorOptimisticSpot) {
      lastOptimisticSigRef.current = null;
      return;
    }
    setNowMs(Date.now());

    if (!ready || !mainSeriesRef.current) return;

    const sig = `${actorOptimisticSpot.blockTimeMs}|${actorOptimisticSpot.spotAfterBnb}|${actorOptimisticSpot.side}`;
    if (lastOptimisticSigRef.current === sig) return;
    lastOptimisticSigRef.current = sig;

    // Use the last rendered authoritative close as open hint for the optimistic bar (matches professional "continuation" candle).
    const lastRendered = renderedCandlesRef.current.length > 0
      ? renderedCandlesRef.current[renderedCandlesRef.current.length - 1]!
      : undefined;

    const opt = createOptimisticCandleBar(
      actorOptimisticSpot,
      timeInterval,
      lastRendered?.close,
      candleUnitScale
    );
    if (!opt) return;

    // Merge into existing live bucket so we never drop a prior trade high/low (no ghost reset).
    const candle =
      lastRendered && lastRendered.time === opt.candle.time
        ? {
            time: opt.candle.time,
            open: lastRendered.open,
            high: Math.max(lastRendered.high, opt.candle.high),
            low: Math.min(lastRendered.low, opt.candle.low),
            close: opt.candle.close,
          }
        : opt.candle;

    const mainSeries = mainSeriesRef.current;

    mainSeries.update(candleToMainChartPoint(chartStyleRef.current, candle) as never);

    // Force the next derive pass to setData (gap-fill + optimistic) — avoids desynced incremental tail.
    renderedFingerprintRef.current = "";

    const ts = chartRef.current?.timeScale();
    if (ts) ts.scrollToRealTime();
  }, [actorOptimisticSpot, ready, timeInterval, candleUnitScale]);

  useEffect(() => {
    if (frozen) return;
    const tickMs = actorOptimisticSpot ? 1_000 : 2_000;
    const timer = setInterval(() => setNowMs(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [frozen, actorOptimisticSpot]);

  const chartEndTimeMs = useMemo(() => {
    if (frozen && seriesState.candles.length > 0) {
      return seriesState.candles[seriesState.candles.length - 1]!.time * 1000;
    }
    const actorMs = actorOptimisticSpot?.blockTimeMs;
    return actorMs != null ? Math.max(nowMs, actorMs) : nowMs;
  }, [frozen, seriesState.candles, nowMs, actorOptimisticSpot?.blockTimeMs]);

  useEffect(() => {
    if (seriesState.source !== "db" || liveCandleUpdates.length === 0) return;
    const update = liveCandleUpdates.find((item) => item.interval === timeInterval);
    if (!update) return;
    logChartWsLag({
      tokenAddress,
      interval: update.interval,
      bucketSec: update.time,
      lagMs: Date.now() - update.time * 1000,
      wsConnected,
    });
    dispatchSeries({
      type: "merge_ws",
      update,
      priceScale: 1,
    });
    renderedFingerprintRef.current = "";
  }, [liveCandleUpdates, timeInterval, seriesState.source, tokenAddress, wsConnected]);

  const chartSeriesState = useMemo(() => {
    if (seriesState.candles.length > 0 || fallbackTrades.length === 0) {
      return seriesState;
    }
    const virtualZugReserve = curveSnapshot?.virtualZugReserve
      ? BigInt(curveSnapshot.virtualZugReserve)
      : undefined;
    const virtualTokenReserve = curveSnapshot?.virtualTokenReserve
      ? BigInt(curveSnapshot.virtualTokenReserve)
      : undefined;
    const { candles, volumes } = buildCandlesFromTrades(
      fallbackTrades,
      timeInterval,
      /** Always native spot — `deriveChartSeries` applies MCAP scale once. */
      1,
      {
        fillGaps: true,
        endTimeMs: chartEndTimeMs,
        virtualZugReserve,
        virtualTokenReserve,
      }
    );
    if (candles.length === 0) return seriesState;
    return {
      candles,
      volumes,
      source: "trades" as const,
      interval: timeInterval,
      gapFilledByApi: false,
    };
  }, [
    seriesState,
    fallbackTrades,
    timeInterval,
    chartEndTimeMs,
    curveSnapshot?.virtualZugReserve,
    curveSnapshot?.virtualTokenReserve,
  ]);

  const { candles, volumes } = useMemo(
    () =>
      deriveChartSeries({
        state: chartSeriesState,
        displayInterval: timeInterval,
        priceScale: candleUnitScale,
        endTimeMs: chartEndTimeMs,
        liveOnChainSpotBnb: liveOnChainSpotBnb,
        actorOptimisticSpot: actorOptimisticSpot,
        actorBucketExtremes,
      }),
    [
      chartSeriesState,
      timeInterval,
      candleUnitScale,
      chartEndTimeMs,
      liveOnChainSpotBnb,
      actorOptimisticSpot,
      actorBucketExtremes,
    ]
  );

  const candlesForChart = candles;
  const volumesForChart = volumes;

  const useLogPriceScale = useMemo(
    () => shouldUseLogPriceScale(candlesForChart, currency),
    [candlesForChart, currency]
  );

  const priceFormat = useMemo(
    () => resolveChartPriceFormat(candlesForChart, currency, bnbUsd, useLogPriceScale),
    [candlesForChart, currency, bnbUsd, useLogPriceScale]
  );

  const chartPriceFormatter = useCallback(
    (price: number) => priceFormat.formatter(price),
    [priceFormat]
  );

  const chartPriceFormatterRef = useRef(chartPriceFormatter);
  chartPriceFormatterRef.current = chartPriceFormatter;

  const fitChartViewport = useCallback((): boolean => {
    const chart = chartRef.current;
    const ts = chart?.timeScale();
    const rightScale = chart?.priceScale("right");
    if (!ts || !rightScale || candlesForChart.length === 0) return false;

    // Only force autoscale on intentional fit (token / interval / currency / Fit button).
    // Live polls must NOT call setAutoScale(true) — that flattens manual Y zoom.
    rightScale.applyOptions({
      mode: useLogPriceScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
    rightScale.setAutoScale(true);
    const { from, to } = visibleLogicalRange(candlesForChart, DEFAULT_VISIBLE_CANDLES);
    ts.setVisibleLogicalRange({ from, to });
    ts.scrollToRealTime();
    return true;
  }, [candlesForChart, useLogPriceScale]);

  // Defer viewport fit until lightweight-charts has laid out setData (fixes flat line on first paint).
  const scheduleFitViewport = useCallback(() => {
    let attempts = 0;
    const tryFit = () => {
      if (fitChartViewport()) {
        shouldFitViewportRef.current = false;
        return;
      }
      if (attempts < 8) {
        attempts += 1;
        requestAnimationFrame(tryFit);
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(tryFit);
    });
  }, [fitChartViewport]);

  const selectInterval = useCallback((id: CandleInterval) => {
    shouldFitViewportRef.current = true;
    renderedCandlesRef.current = [];
    renderedFingerprintRef.current = "";
    setTimeInterval((prev) => {
      if (prev === id) {
        scheduleFitViewport();
      }
      return id;
    });
  }, [scheduleFitViewport]);

  useEffect(() => {
    renderedCandlesRef.current = [];
    renderedFingerprintRef.current = "";
    lastTradeBucketCountRef.current = 0;
    shouldFitViewportRef.current = true;
  }, [tokenAddress]);

  useEffect(() => {
    shouldFitViewportRef.current = true;
  }, [timeInterval, currency]);

  useEffect(() => {
    if (seriesState.candles.length > 0 && renderedCandlesRef.current.length === 0) {
      shouldFitViewportRef.current = true;
    }
  }, [seriesState.candles.length, seriesState.source, tokenAddress]);

  useEffect(() => {
    if (prevPriceScaleRef.current != null && prevPriceScaleRef.current !== candleUnitScale) {
      shouldFitViewportRef.current = true;
    }
    prevPriceScaleRef.current = candleUnitScale;
  }, [candleUnitScale]);

  const selectCurrency = useCallback(
    (next: "usd" | "mcap") => {
      shouldFitViewportRef.current = true;
      onCurrencyChange?.(next);
      if (currencyProp === undefined) {
        setInternalCurrency(next);
      }
    },
    [currencyProp, onCurrencyChange]
  );

  const scheduleFitViewportRef = useRef(scheduleFitViewport);
  scheduleFitViewportRef.current = scheduleFitViewport;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setHideTimeAxis(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Create chart once — container is always in the DOM.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || chartRef.current) return;

    const height = resolveChartHeight(el, fillContainer);
    const bgColor = `rgb(${cssVar("--pump-bg", "10 11 13")})`;
    const textColor = `rgb(${cssVar("--pump-muted", "142 157 181")})`;
    const borderColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.22)`;
    const gridColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.12)`;
    const crosshairColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.32)`;
    const chartAxisFontSize = resolveChartAxisFontSize();
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontSize: chartAxisFontSize,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: crosshairColor, width: 1, style: 2 },
        horzLine: { color: crosshairColor, width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor,
        scaleMargins: { top: 0.08, bottom: 0.08 },
        autoScale: true,
        mode: PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor,
        visible: !hideTimeAxis,
        timeVisible: !hideTimeAxis,
        secondsVisible: false,
        barSpacing: 12,
        minBarSpacing: 6,
        rightOffset: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: (time: Time) => formatLocalChartTick(time, false),
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
      },
      width: el.clientWidth || el.offsetWidth,
      height,
      localization: {
        locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
        timeFormatter: (time: Time) => formatLocalChartTime(time),
        priceFormatter: (price: number) => chartPriceFormatterRef.current(price),
      },
    });

    const candleSeries = createMainChartSeries(
      chart,
      chartStyleRef.current,
      resolveChartSeriesColors(),
      { autoscaleInfoProvider: chartAutoscaleInfoProvider }
    );

    chartRef.current = chart;
    mainSeriesRef.current = candleSeries;
    setReady(true);

    const ro = new ResizeObserver(() => {
      if (!el) return;
      const width = el.clientWidth;
      chart.applyOptions({ width, height: resolveChartHeight(el, fillContainer) });
      if (width > 0 && shouldFitViewportRef.current) {
        requestAnimationFrame(() => {
          scheduleFitViewportRef.current();
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      setReady(false);
    };
  }, [fillContainer]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: {
        visible: !hideTimeAxis,
        timeVisible: !hideTimeAxis,
      },
    });
  }, [hideTimeAxis]);

  useEffect(() => {
    if (!chartRef.current) return;

    const bgColor = `rgb(${cssVar("--pump-bg", "10 11 13")})`;
    const textColor = `rgb(${cssVar("--pump-muted", "142 157 181")})`;
    const borderColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.22)`;
    const gridColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.12)`;
    const crosshairColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.32)`;

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontSize: resolveChartAxisFontSize(),
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: crosshairColor, width: 1, style: 2 },
        horzLine: { color: crosshairColor, width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor,
      },
    });
  }, [theme]);

  // Swap Candles / Line / Area / … — same OHLC, no refetch. Recolor on theme.
  const appliedChartStyleRef = useRef<string>("");
  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart || !mainSeriesRef.current) return;

    const styleKey = `${chartStyle}|${theme}`;
    if (appliedChartStyleRef.current === styleKey) return;
    appliedChartStyleRef.current = styleKey;

    const prev = mainSeriesRef.current;
    chart.removeSeries(prev);
    const source = renderedCandlesRef.current;
    const baselinePrice = source[0]?.close ?? 0;
    const next = createMainChartSeries(chart, chartStyle, resolveChartSeriesColors(), {
      autoscaleInfoProvider: chartAutoscaleInfoProvider,
      baselinePrice,
    });
    mainSeriesRef.current = next;
    renderedFingerprintRef.current = "";
    shouldFitViewportRef.current = true;
    if (source.length > 0) {
      next.setData(candlesToMainChartData(chartStyle, source) as never);
      scheduleFitViewport();
    }
  }, [chartStyle, theme, ready, scheduleFitViewport]);
  // Log scale when price range is wide (meme launch curves); MCAP stays linear.
  // Do not setAutoScale here — live candle ticks would wipe manual Y-axis zoom.
  // Autoscale only via fitChartViewport (interval / currency / token / Fit).
  const lastPriceScaleModeRef = useRef<PriceScaleMode | null>(null);
  useEffect(() => {
    const rightScale = chartRef.current?.priceScale("right");
    if (!rightScale) return;
    const nextMode = useLogPriceScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal;
    if (lastPriceScaleModeRef.current === nextMode) return;
    lastPriceScaleModeRef.current = nextMode;
    rightScale.applyOptions({ mode: nextMode });
    if (shouldFitViewportRef.current) {
      rightScale.setAutoScale(true);
    }
  }, [currency, useLogPriceScale, timeInterval]);

  // Local timezone labels on chart axis.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      timeScale: {
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => formatLocalChartTick(time, false),
      },
      localization: {
        locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
        timeFormatter: (time: Time) => formatLocalChartTime(time),
        priceFormatter: (price: number) => chartPriceFormatterRef.current(price),
      },
    });
  }, [priceFormat]);

  // Push candle data — setData on structural changes; series.update() for live tail.
  useEffect(() => {
    if (!ready || !mainSeriesRef.current) return;

    const mainSeries = mainSeriesRef.current;
    const rightScale = chartRef.current?.priceScale("right");
    const nextMode = useLogPriceScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal;
    if (lastPriceScaleModeRef.current !== nextMode) {
      lastPriceScaleModeRef.current = nextMode;
      rightScale?.applyOptions({ mode: nextMode });
    }
    if (shouldFitViewportRef.current) {
      rightScale?.applyOptions({ mode: nextMode });
      rightScale?.setAutoScale(true);
    }
    applyCandleSeriesPriceFormat(mainSeries, priceFormat, candlesForChart);

    const nextCandles = candlesForChart;
    const nextVolumes = volumesForChart;
    const fingerprint = `${tokenAddress}|${timeInterval}|${currency}|${candleUnitScale}|${chartStyle}`;
    const prevCandles = renderedCandlesRef.current;

    const applyFullSeries = () => {
      mainSeries.setData(candlesToMainChartData(chartStyle, nextCandles) as never);
      renderedCandlesRef.current = nextCandles;
      renderedFingerprintRef.current = fingerprint;
    };

    if (nextCandles.length === 0) {
      mainSeries.setData([]);
      renderedCandlesRef.current = [];
      renderedFingerprintRef.current = fingerprint;
      return;
    }

    const needsFullSet =
      shouldFitViewportRef.current ||
      fingerprint !== renderedFingerprintRef.current ||
      prevCandles.length === 0 ||
      seriesHasTemporalGaps(nextCandles, timeInterval) ||
      !canIncrementalChartPatch(prevCandles, nextCandles) ||
      needsFullCandleResync(prevCandles, nextCandles);

    if (needsFullSet) {
      applyFullSeries();
    } else {
      const startIdx = incrementalPatchStartIndex(prevCandles, nextCandles);
      for (let i = startIdx; i < nextCandles.length; i++) {
        const candle = nextCandles[i];
        if (!candle) continue;
        mainSeries.update(candleToMainChartPoint(chartStyle, candle) as never);
      }
      renderedCandlesRef.current = nextCandles;
    }

    const ts = chartRef.current?.timeScale();
    if (!ts) return;

    const tradeBucketCount = nextVolumes.filter((v) => v.value > 0).length;

    if (shouldFitViewportRef.current) {
      if (nextCandles.length > 0) {
        scheduleFitViewport();
      }
      lastTradeBucketCountRef.current = tradeBucketCount;
      return;
    }

    if (tradeBucketCount > lastTradeBucketCountRef.current) {
      ts.scrollToRealTime();
      lastTradeBucketCountRef.current = tradeBucketCount;
    }
  }, [
    candlesForChart,
    volumesForChart,
    priceFormat,
    ready,
    scheduleFitViewport,
    tokenAddress,
    timeInterval,
    currency,
    candleUnitScale,
    useLogPriceScale,
    chartStyle,
  ]);

  const showEmpty = !loading && !error && candles.length === 0;
  const showError = !loading && error && candles.length === 0;
  const chromeBlockClass = fillContainer ? "shrink-0" : "";

  const selectChartStyle = useCallback((next: ChartDisplayStyle) => {
    writeChartDisplayStyle(next);
    setChartStyle(next);
    setStyleMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!styleMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStyleMenuOpen(false);
    };
    /** Defer so the opening click does not immediately close the menu. */
    const timer = window.setTimeout(() => {
      const onPointer = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.(".price-chart-style-menu")) return;
        setStyleMenuOpen(false);
      };
      window.addEventListener("mousedown", onPointer);
      cleanupPointer = () => window.removeEventListener("mousedown", onPointer);
    }, 0);
    let cleanupPointer: (() => void) | undefined;
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      cleanupPointer?.();
      window.removeEventListener("keydown", onKey);
    };
  }, [styleMenuOpen]);

  return (
    <section
      className={
        fillContainer
          ? "panel-surface flex min-h-0 flex-1 flex-col overflow-hidden"
          : "panel-surface overflow-hidden"
      }
    >
      <div
        className={`price-chart-toolbar ${chromeBlockClass}${
          styleMenuOpen ? " price-chart-toolbar--menu-open" : ""
        }`}
      >
        <div className="price-chart-toolbar__leading">
          <div className="price-chart-toolbar__intervals">
            <div className="price-chart-toolbar__interval-row">
              <div className="segment-control">
                {CANDLE_INTERVALS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectInterval(item.id)}
                    className={`price-chart-toolbar__btn shrink-0 transition ${
                      timeInterval === item.id
                        ? "chip-button-active"
                        : "chip-button chip-button-ghost"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="price-chart-style-menu shrink-0">
            <button
              type="button"
              aria-label="Chart type"
              aria-haspopup="listbox"
              aria-expanded={styleMenuOpen}
              onClick={() => setStyleMenuOpen((open) => !open)}
              className={`price-chart-style-trigger transition ${
                styleMenuOpen ? "chip-button-active" : "chip-button chip-button-ghost"
              }`}
              title="Chart type"
            >
              <PumpIcon
                icon={chartDisplayStyleIcon(chartStyle)}
                size="xs"
                className="price-chart-style-trigger__icon"
              />
              <PumpIcon
                icon={faChevronDown}
                size="xs"
                className={`price-chart-style-trigger__caret${
                  styleMenuOpen ? " price-chart-style-trigger__caret--open" : ""
                }`}
              />
            </button>
            {styleMenuOpen ? (
              <div role="listbox" className="price-chart-style-menu__panel">
                {CHART_DISPLAY_STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={chartStyle === option.id}
                    onClick={() => selectChartStyle(option.id)}
                    className={`price-chart-style-menu__item ${
                      chartStyle === option.id ? "price-chart-style-menu__item--active" : ""
                    }`}
                  >
                    <PumpIcon icon={option.icon} className="price-chart-style-menu__item-icon" />
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="price-chart-toolbar__actions">
          <div className="segment-control shrink-0">
            <button
              type="button"
              onClick={() => selectCurrency("usd")}
              disabled={bnbUsd == null}
              className={`price-chart-toolbar__btn transition disabled:opacity-40 ${
                currency === "usd"
                  ? "chip-button-active"
                  : "chip-button chip-button-ghost"
              }`}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => selectCurrency("mcap")}
              disabled={bnbUsd == null}
              className={`price-chart-toolbar__btn transition disabled:opacity-40 ${
                currency === "mcap"
                  ? "chip-button-active"
                  : "chip-button chip-button-ghost"
              }`}
            >
              MCAP
            </button>
          </div>
          <button
            type="button"
            title="Reset zoom"
            onClick={() => {
              shouldFitViewportRef.current = true;
              scheduleFitViewport();
            }}
            className="price-chart-toolbar__btn chip-button chip-button-ghost hidden shrink-0 md:inline-flex"
          >
            Fit
          </button>
        </div>
      </div>

      {/* Chart container always mounted so lightweight-charts can init on first load */}
      <div
        className={
          fillContainer ? "price-chart-canvas relative min-h-0 flex-1" : "relative"
        }
      >
        {(loading && candles.length === 0) || showEmpty || showError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-pump-bg/92 px-4 text-center text-sm">
            {loading && candles.length === 0 ? (
              <span className="text-pump-muted">Loading chart…</span>
            ) : showError ? (
              <span className="text-pump-danger">{error}</span>
            ) : (
              <span className="text-pump-muted">No trades yet — chart appears after the first swap.</span>
            )}
          </div>
        ) : null}
        <div
          ref={containerRef}
          className="h-full w-full"
          style={fillContainer ? undefined : { height: chartHeightPx() }}
        />
      </div>
    </section>
  );
}

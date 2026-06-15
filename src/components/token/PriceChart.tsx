"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { TradeItem } from "@/lib/db/launchpad";
import {
  buildCandlesFromTrades,
  CANDLE_INTERVALS,
  formatPumpSubscriptPrice,
  resolveChartPriceFormat,
  type CandleBar,
  type CandleInterval,
} from "@/lib/candles";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  bnbToUsd,
  DEFAULT_TOKEN_TOTAL_SUPPLY,
  formatUsd,
  formatUsdReadable,
} from "@/lib/format-usd";

type PriceChartProps = {
  tokenAddress: string;
  symbol: string;
  status: string;
  optimisticTrades?: TradeItem[];
  wsConnected?: boolean;
  bnbUsd?: number | null;
  currentPriceUsd?: number | null;
  currentMcapUsd?: number | null;
  volume24hBnb?: number;
  price24hChangePct?: number | null;
};

const POLL_MS = 4_000;
const WS_FALLBACK_POLL_MS = 30_000;
const VOLUME_SCALE_ID = "volume";

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

function formatOhlc(value: number, currency: "usd" | "mcap"): string {
  if (currency === "mcap") return formatUsd(value, { compact: true }) ?? "$0";
  if (currency === "usd") return formatPumpSubscriptPrice(value, "$");
  if (value >= 0.001) return value.toFixed(6);
  return formatPumpSubscriptPrice(value, "");
}

/** UTC label for axis + crosshair (lightweight-charts uses unix seconds). */
function formatUtcTime(time: Time): string {
  if (typeof time !== "number") return "";
  return formatUtcMs(time * 1000);
}

function formatUtcMs(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

export function PriceChart({
  tokenAddress,
  symbol,
  status,
  optimisticTrades = [],
  wsConnected = false,
  bnbUsd = null,
  currentPriceUsd = null,
  currentMcapUsd = null,
  volume24hBnb = 0,
  price24hChangePct = null,
}: PriceChartProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  /** Fit viewport only on first paint or interval/currency change — not every poll. */
  const shouldFitViewportRef = useRef(true);
  const lastCandleCountRef = useRef(0);

  const [timeInterval, setTimeInterval] = useState<CandleInterval>("1m");
  const [currency, setCurrency] = useState<"usd" | "mcap">("usd");
  const [dbTrades, setDbTrades] = useState<TradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverOhlc, setHoverOhlc] = useState<CandleBar | null>(null);
  const [hoverTimeUtc, setHoverTimeUtc] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

  const frozen = false;
  const priceScale =
    currency === "mcap"
      ? bnbUsd != null && bnbUsd > 0
        ? bnbUsd * DEFAULT_TOKEN_TOTAL_SUPPLY
        : 1
      : bnbUsd != null && bnbUsd > 0
        ? bnbUsd
        : 1;
  const unitLabel = currency === "usd" ? "USD" : "MCAP";

  const fetchChartTrades = useCallback(async () => {
    try {
      const res = await fetch(`/api/tokens/${tokenAddress}/chart-trades`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load chart trades");
      const body = (await res.json()) as { data?: TradeItem[] };
      setDbTrades(body.data ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chart load failed");
    } finally {
      setLoading(false);
    }
  }, [tokenAddress]);

  useEffect(() => {
    setLoading(true);
    void fetchChartTrades();
  }, [fetchChartTrades]);

  useEffect(() => {
    if (frozen) return;
    const pollMs = wsConnected ? WS_FALLBACK_POLL_MS : POLL_MS;
    const timer = setInterval(() => void fetchChartTrades(), pollMs);
    return () => clearInterval(timer);
  }, [fetchChartTrades, frozen, wsConnected]);

  useEffect(() => {
    if (frozen) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [frozen]);

  const mergedTrades = useMemo(() => {
    const byId = new Map<string, TradeItem>();
    for (const t of dbTrades) byId.set(t.id, t);
    for (const t of optimisticTrades) {
      if (!byId.has(t.id)) byId.set(t.id, t);
    }
    return [...byId.values()].sort(
      (a, b) => new Date(a.blockTime).getTime() - new Date(b.blockTime).getTime()
    );
  }, [dbTrades, optimisticTrades]);

  const chartEndTimeMs = useMemo(() => {
    if (frozen && mergedTrades.length > 0) {
      return new Date(mergedTrades[mergedTrades.length - 1]!.blockTime).getTime();
    }
    return nowMs;
  }, [frozen, mergedTrades, nowMs]);

  const { candles, volumes } = useMemo(
    () =>
      buildCandlesFromTrades(mergedTrades, timeInterval, priceScale, {
        fillGaps: true,
        endTimeMs: chartEndTimeMs,
      }),
    [mergedTrades, timeInterval, priceScale, chartEndTimeMs]
  );

  const lastCandle = candles[candles.length - 1] ?? null;
  const displayTimeUtc = hoverTimeUtc ?? (frozen ? null : formatUtcMs(nowMs));
  const displayCandle = hoverOhlc ?? lastCandle;

  const priceFormat = useMemo(
    () => resolveChartPriceFormat(candles, currency),
    [candles, currency]
  );

  const selectInterval = useCallback((id: CandleInterval) => {
    shouldFitViewportRef.current = true;
    setTimeInterval(id);
  }, []);

  const selectCurrency = useCallback((next: "usd" | "mcap") => {
    shouldFitViewportRef.current = true;
    setCurrency(next);
  }, []);

  // Create chart once — container is always in the DOM.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || chartRef.current) return;

    const height = chartHeightPx();
    const bgColor = `rgb(${cssVar("--pump-card", "16 27 44")})`;
    const textColor = `rgb(${cssVar("--pump-muted", "142 157 181")})`;
    const borderColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.22)`;
    const gridColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.12)`;
    const crosshairColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.32)`;
    const upColor = `rgb(${cssVar("--pump-success", "56 197 129")})`;
    const downColor = `rgb(${cssVar("--pump-danger", "227 95 95")})`;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontSize: 12,
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
        scaleMargins: { top: 0.06, bottom: 0.2 },
        autoScale: true,
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: true,
        barSpacing: 10,
        minBarSpacing: 4,
        rightOffset: 12,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: (time: Time) => {
          if (typeof time !== "number") return "";
          const d = new Date(time * 1000);
          const hh = d.getUTCHours().toString().padStart(2, "0");
          const mm = d.getUTCMinutes().toString().padStart(2, "0");
          const ss = d.getUTCSeconds().toString().padStart(2, "0");
          return `${hh}:${mm}:${ss}`;
        },
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
        locale: "en-US",
        timeFormatter: formatUtcTime,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: VOLUME_SCALE_ID,
    });
    chart.priceScale(VOLUME_SCALE_ID).applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: false,
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setHoverOhlc(null);
        setHoverTimeUtc(null);
        return;
      }
      setHoverTimeUtc(formatUtcTime(param.time));
      const bar = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      if (!bar || bar.open == null) {
        setHoverOhlc(null);
        return;
      }
      setHoverOhlc({
        time: bar.time as number,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    setReady(true);

    const ro = new ResizeObserver(() => {
      if (!el) return;
      chart.applyOptions({ width: el.clientWidth, height: chartHeightPx() });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      setReady(false);
    };
  }, []);

  // Time scale options when interval changes (do not recreate chart).
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({ secondsVisible: true });
  }, [timeInterval]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const bgColor = `rgb(${cssVar("--pump-card", "16 27 44")})`;
    const textColor = `rgb(${cssVar("--pump-muted", "142 157 181")})`;
    const borderColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.22)`;
    const gridColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.12)`;
    const crosshairColor = `rgb(${cssVar("--pump-border", "96 116 148")} / 0.32)`;
    const upColor = `rgb(${cssVar("--pump-success", "56 197 129")})`;
    const downColor = `rgb(${cssVar("--pump-danger", "227 95 95")})`;

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontSize: 12,
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
        scaleMargins: { top: 0.06, bottom: 0.2 },
        autoScale: true,
      },
      timeScale: {
        borderColor,
      },
    });

    candleSeriesRef.current.applyOptions({
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });
  }, [theme]);

  // Push candle data — fit viewport only when needed, never on every poll.
  useEffect(() => {
    if (!ready || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    candleSeriesRef.current.applyOptions({ priceFormat });

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: c.time as CandlestickData["time"],
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData[] = volumes.map((v) => ({
      time: v.time as HistogramData["time"],
      value: v.value,
      color: v.color,
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    if (candleData.length === 0) return;

    const ts = chartRef.current?.timeScale();
    const rightScale = chartRef.current?.priceScale("right");
    if (!ts || !rightScale) return;

    if (shouldFitViewportRef.current) {
      // Reset both axes when the user switches chart mode/interval so MCAP/USD
      // doesn't inherit a stale manually zoomed price range.
      rightScale.setAutoScale(true);
      ts.fitContent();
      shouldFitViewportRef.current = false;
      lastCandleCountRef.current = candleData.length;
      return;
    }

    // New candle appeared — scroll to latest without resetting user's zoom.
    if (candleData.length > lastCandleCountRef.current) {
      ts.scrollToRealTime();
      lastCandleCountRef.current = candleData.length;
    }
  }, [candles, volumes, priceFormat, ready]);

  const summaryValue =
    currency === "usd"
      ? (currentPriceUsd != null ? formatPumpSubscriptPrice(currentPriceUsd, "$") : "—")
      : (currentMcapUsd != null ? formatUsd(currentMcapUsd, { compact: true }) ?? "—" : "—");
  const summaryDeltaPct = price24hChangePct;
  const summaryDeltaTone =
    summaryDeltaPct == null
      ? "text-pump-muted"
      : summaryDeltaPct >= 0
        ? "text-pump-success"
        : "text-pump-danger";
  const summaryDeltaPctText =
    summaryDeltaPct == null
      ? "—"
      : `${summaryDeltaPct >= 0 ? "+" : ""}${summaryDeltaPct.toFixed(2)}%`;

  const volumeUsd = bnbToUsd(volume24hBnb, bnbUsd);
  const volumeUsdLabel =
    volumeUsd != null ? formatUsdReadable(volumeUsd, { compact: true }) : null;

  const showEmpty = !loading && !error && mergedTrades.length === 0;
  const showError = !loading && error && mergedTrades.length === 0;

  return (
    <section className="panel-surface overflow-hidden">
      <div className="px-4 py-2.5 md:py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="section-label leading-none">
              {currency === "usd" ? "Price" : "Market cap"}
            </p>
            <div className="segment-control shrink-0">
                <button
                  type="button"
                  onClick={() => selectCurrency("usd")}
                  disabled={bnbUsd == null}
                  className={`px-2 py-0.5 text-[10px] font-medium transition disabled:opacity-40 sm:px-2.5 sm:py-1 sm:text-[11px] md:text-caption ${
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
                  className={`px-2 py-0.5 text-[10px] font-medium transition disabled:opacity-40 sm:px-2.5 sm:py-1 sm:text-[11px] md:text-caption ${
                    currency === "mcap"
                      ? "chip-button-active"
                      : "chip-button chip-button-ghost"
                  }`}
                >
                MCAP
              </button>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2">
            <div className="flex min-w-0 items-end gap-x-1.5 gap-y-0">
              <p className="financial-value text-[1.625rem] font-semibold leading-none text-pump-text sm:text-[1.75rem] md:text-[1.875rem]">
                {summaryValue}
              </p>
              <span
                className={`financial-value pb-px text-[11px] font-semibold leading-none sm:text-body-sm ${summaryDeltaTone}`}
              >
                {summaryDeltaPctText}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-x-1 whitespace-nowrap text-[10px] leading-none sm:text-[11px] md:text-caption">
              <span className="text-pump-muted">Vol</span>
              <span className="financial-value font-semibold text-pump-text">
                {volumeUsdLabel ?? "—"}
              </span>
              <span className="text-pump-muted">24h</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-pump-border/10 px-3 py-2.5">
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex min-w-max items-center gap-2">
            <div className="segment-control">
              {CANDLE_INTERVALS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectInterval(item.id)}
                  className={`shrink-0 px-2.5 py-1.5 text-[11px] font-medium transition md:px-3 md:text-caption ${
                    timeInterval === item.id
                      ? "chip-button-active"
                      : "chip-button chip-button-ghost"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="financial-value shrink-0 pr-1 text-[11px] text-pump-muted md:text-caption">
              {symbol}/{unitLabel}
            </span>
          </div>
        </div>
        <button
          type="button"
          title="Reset zoom"
          onClick={() => {
            shouldFitViewportRef.current = true;
            chartRef.current?.timeScale().fitContent();
          }}
          className="chip-button chip-button-ghost hidden shrink-0 px-2.5 py-1.5 text-caption md:inline-flex"
        >
          Fit
        </button>
      </div>

      {displayCandle ? (
        <div className="financial-value flex items-center gap-x-3 overflow-x-auto border-t border-pump-border/10 px-3 py-1.5 text-[11px] text-pump-muted [scrollbar-width:none] md:gap-x-4 md:py-2 md:text-xs [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0">
            O <span className="text-pump-text">{formatOhlc(displayCandle.open, currency)}</span>
          </span>
          <span className="shrink-0">
            H <span className="text-pump-accent">{formatOhlc(displayCandle.high, currency)}</span>
          </span>
          <span className="shrink-0">
            L <span className="text-pump-danger">{formatOhlc(displayCandle.low, currency)}</span>
          </span>
          <span className="shrink-0">
            C <span className="text-pump-text">{formatOhlc(displayCandle.close, currency)}</span>
          </span>
          {hoverOhlc && displayTimeUtc ? (
            <span className="hidden shrink-0 sm:inline">{displayTimeUtc}</span>
          ) : null}
        </div>
      ) : null}

      {/* Chart container always mounted so lightweight-charts can init on first load */}
      <div className="relative">
        {(loading && mergedTrades.length === 0) || showEmpty || showError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-pump-card/92 px-4 text-center text-sm">
            {loading && mergedTrades.length === 0 ? (
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
          className="w-full"
          style={{ height: chartHeightPx() }}
        />
      </div>
    </section>
  );
}

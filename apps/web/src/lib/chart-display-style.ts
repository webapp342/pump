import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type AreaData,
  type BarData,
  type BaselineData,
  type CandlestickData,
  type LineData,
} from "lightweight-charts";
import type { CandleBar } from "@/lib/candles";
import type { PumpIconDefinition } from "@/components/icons/PumpIcon";
import {
  faChartArea,
  faChartBaseline,
  faChartCandlestick,
  faChartLine,
  faChartWaterfall,
} from "@/lib/pump-icons";

export type ChartDisplayStyle = "candles" | "bars" | "line" | "area" | "baseline";

export const CHART_DISPLAY_STYLE_OPTIONS: ReadonlyArray<{
  id: ChartDisplayStyle;
  label: string;
  icon: PumpIconDefinition;
}> = [
  { id: "candles", label: "Candles", icon: faChartCandlestick },
  { id: "bars", label: "Bars", icon: faChartWaterfall },
  { id: "line", label: "Line", icon: faChartLine },
  { id: "area", label: "Area", icon: faChartArea },
  { id: "baseline", label: "Baseline", icon: faChartBaseline },
] as const;

export const CHART_DISPLAY_STYLE_STORAGE_KEY = "pump-chart-style";

const STYLE_IDS = new Set<string>(CHART_DISPLAY_STYLE_OPTIONS.map((o) => o.id));

export function readChartDisplayStyle(): ChartDisplayStyle {
  if (typeof window === "undefined") return "candles";
  try {
    const stored = localStorage.getItem(CHART_DISPLAY_STYLE_STORAGE_KEY)?.trim();
    if (stored && STYLE_IDS.has(stored)) return stored as ChartDisplayStyle;
  } catch {
    /* private mode */
  }
  return "candles";
}

export function writeChartDisplayStyle(style: ChartDisplayStyle): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHART_DISPLAY_STYLE_STORAGE_KEY, style);
  } catch {
    /* quota */
  }
}

export function chartStyleUsesOhlc(style: ChartDisplayStyle): boolean {
  return style === "candles" || style === "bars";
}

export type MainChartPoint =
  | CandlestickData
  | BarData
  | LineData
  | AreaData
  | BaselineData;

export function candleToMainChartPoint(
  style: ChartDisplayStyle,
  candle: CandleBar
): MainChartPoint {
  const time = candle.time as Time;
  if (style === "candles" || style === "bars") {
    return {
      time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    };
  }
  return { time, value: candle.close };
}

export function candlesToMainChartData(
  style: ChartDisplayStyle,
  candles: CandleBar[]
): MainChartPoint[] {
  return candles.map((c) => candleToMainChartPoint(style, c));
}

export function chartDisplayStyleLabel(style: ChartDisplayStyle): string {
  return CHART_DISPLAY_STYLE_OPTIONS.find((o) => o.id === style)?.label ?? "Candles";
}

export function chartDisplayStyleIcon(style: ChartDisplayStyle): PumpIconDefinition {
  return (
    CHART_DISPLAY_STYLE_OPTIONS.find((o) => o.id === style)?.icon ?? faChartCandlestick
  );
}

export type ChartSeriesColors = {
  up: string;
  down: string;
  line: string;
  areaTop: string;
  areaBottom: string;
  baselineBottomFill: string;
};

/** Create main price series for the selected display style (client-only; same OHLC source). */
export function createMainChartSeries(
  chart: IChartApi,
  style: ChartDisplayStyle,
  colors: ChartSeriesColors,
  options: {
    // LWC CandlestickSeriesOptions['autoscaleInfoProvider']
    autoscaleInfoProvider?: (
      original: () => { priceRange: { minValue: number; maxValue: number } } | null
    ) => { priceRange: { minValue: number; maxValue: number } } | null;
    baselinePrice?: number;
  } = {}
): ISeriesApi<SeriesType> {
  const { autoscaleInfoProvider, baselinePrice = 0 } = options;
  /** Single last-price label + dashed line — avoid createPriceLine duplicate axis labels. */
  const lastPriceChrome = {
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineWidth: 1 as const,
    priceLineStyle: LineStyle.Dashed,
  };

  if (style === "candles") {
    return chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      borderVisible: true,
      wickVisible: true,
      autoscaleInfoProvider,
      ...lastPriceChrome,
    });
  }

  if (style === "bars") {
    return chart.addSeries(BarSeries, {
      upColor: colors.up,
      downColor: colors.down,
      thinBars: false,
      autoscaleInfoProvider,
      ...lastPriceChrome,
    });
  }

  if (style === "line") {
    return chart.addSeries(LineSeries, {
      color: colors.line,
      lineWidth: 2,
      autoscaleInfoProvider,
      ...lastPriceChrome,
    });
  }

  if (style === "area") {
    return chart.addSeries(AreaSeries, {
      lineColor: colors.line,
      topColor: colors.areaTop,
      bottomColor: colors.areaBottom,
      lineWidth: 2,
      autoscaleInfoProvider,
      ...lastPriceChrome,
    });
  }

  return chart.addSeries(BaselineSeries, {
    baseValue: { type: "price", price: baselinePrice },
    topLineColor: colors.up,
    topFillColor1: colors.areaTop,
    topFillColor2: "rgba(0,0,0,0)",
    bottomLineColor: colors.down,
    bottomFillColor1: "rgba(0,0,0,0)",
    bottomFillColor2: colors.baselineBottomFill,
    lineWidth: 2,
    autoscaleInfoProvider,
    ...lastPriceChrome,
  });
}

export function resolveChartSeriesColors(): ChartSeriesColors {
  const up = `rgb(${cssVar("--pump-success", "56 197 129")})`;
  const down = `rgb(${cssVar("--pump-danger", "227 95 95")})`;
  return {
    up,
    down,
    line: up,
    areaTop: `rgb(${cssVar("--pump-success", "56 197 129")} / 0.28)`,
    areaBottom: `rgb(${cssVar("--pump-success", "56 197 129")} / 0.02)`,
    baselineBottomFill: `rgb(${cssVar("--pump-danger", "227 95 95")} / 0.18)`,
  };
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

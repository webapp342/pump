/**
 * Lightweight chart / WS lag telemetry — structured console logs for ops.
 * See `.cursor/docs/price-accuracy-contract.md`.
 */

type ChartFetchMark = {
  tokenAddress: string;
  interval: string;
  source: "db" | "trades";
  durationMs: number;
  bucketCount: number;
  gapFill: "sql" | "ts" | "none";
};

type ChartWsLagMark = {
  tokenAddress: string;
  interval: string;
  bucketSec: number;
  lagMs: number;
  wsConnected: boolean;
};

const CHART_LAG_WARN_MS = 8_000;

export function markChartFetchStart(tokenAddress: string, interval: string): string {
  const mark = `chart_fetch_${tokenAddress}_${interval}`;
  if (typeof performance !== "undefined") {
    performance.mark(`${mark}_start`);
  }
  return mark;
}

export function logChartFetchComplete(details: ChartFetchMark & { mark: string }): void {
  let durationMs = details.durationMs;
  if (typeof performance !== "undefined") {
    try {
      performance.measure(
        details.mark,
        `${details.mark}_start`,
        `${details.mark}_end`
      );
      const entries = performance.getEntriesByName(details.mark);
      const last = entries[entries.length - 1];
      if (last) durationMs = Math.round(last.duration);
    } catch {
      // ignore missing marks
    }
  }

  if (process.env.NODE_ENV === "production" && durationMs < 500) return;

  console.info(
    JSON.stringify({
      event: "chart_fetch",
      at: new Date().toISOString(),
      ...details,
      durationMs,
    })
  );
}

export function logChartWsLag(details: ChartWsLagMark): void {
  if (details.lagMs < CHART_LAG_WARN_MS) return;

  console.warn(
    JSON.stringify({
      event: "chart_ws_lag",
      at: new Date().toISOString(),
      ...details,
      warnThresholdMs: CHART_LAG_WARN_MS,
    })
  );
}

export function logChartWsMerge(details: {
  tokenAddress: string;
  interval: string;
  updateCount: number;
  isNewBucket: boolean;
}): void {
  if (process.env.NODE_ENV === "test") return;

  console.debug(
    JSON.stringify({
      event: "chart_ws_merge",
      at: new Date().toISOString(),
      ...details,
    })
  );
}

export type ChartOlapSource =
  | "candles_spot"
  | "candles_mv"
  | "postgres"
  | "trades_replay"
  | "cache";

export function logChartOlapSource(details: {
  tokenAddress: string;
  interval: string;
  olap: ChartOlapSource;
  bucketCount?: number;
  cached?: boolean;
}): void {
  if (process.env.NODE_ENV === "test") return;
  if (process.env.NODE_ENV === "production" && details.cached) return;

  console.info(
    JSON.stringify({
      event: "chart_olap_source",
      at: new Date().toISOString(),
      ...details,
    })
  );
}

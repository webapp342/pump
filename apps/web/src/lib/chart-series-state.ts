import {
  applyActorOptimisticCandleBucket,
  fillGapsForStoredCandles,
  mergeWsCandleUpdate,
  sanitizeTailCandleSeries,
  scaleCandleBars,
  seriesHasTemporalGaps,
  type ActorOptimisticChartSpot,
  type CandleBar,
  type CandleInterval,
  type CandleWsUpdate,
  type StoredCandleSource,
  type VolumeBar,
} from "@/lib/candles";

export type ChartSeriesState = {
  candles: CandleBar[];
  volumes: VolumeBar[];
  source: StoredCandleSource;
  interval: CandleInterval | null;
  /** API/SQL already gap-filled — client must not regap. */
  gapFilledByApi: boolean;
};

export const initialChartSeriesState: ChartSeriesState = {
  candles: [],
  volumes: [],
  source: "db",
  interval: null,
  gapFilledByApi: false,
};

export type ActorBucketExtremes = {
  bucketSec: number;
  low: number;
  high: number;
};

/**
 * HTTP history must never clobber a fresher WS tip (CH insert is async).
 * Enterprise dual-path: ClickHouse/API = history, WS = open bucket SSOT.
 */
export function preserveLiveTailOverFetch(
  fetchedCandles: CandleBar[],
  fetchedVolumes: VolumeBar[],
  liveCandles: CandleBar[],
  liveVolumes: VolumeBar[]
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (liveCandles.length === 0 || fetchedCandles.length === 0) {
    return { candles: fetchedCandles, volumes: fetchedVolumes };
  }

  const liveTail = liveCandles[liveCandles.length - 1]!;
  const liveVol = liveVolumes[liveVolumes.length - 1];
  const candles = fetchedCandles.slice();
  const volumes = fetchedVolumes.slice();
  const idx = candles.findIndex((c) => c.time === liveTail.time);

  if (idx >= 0) {
    // Live open-bucket SSOT: replace fetched tip entirely (open included).
    candles[idx] = { ...liveTail };
    if (liveVol && idx < volumes.length) {
      volumes[idx] = { ...liveVol };
    }
    return {
      candles,
      volumes,
    };
  }

  const fetchTail = candles[candles.length - 1]!;
  if (liveTail.time > fetchTail.time) {
    candles.push(liveTail);
    if (liveVol) volumes.push(liveVol);
  }

  return {
    candles,
    volumes,
  };
}

function applyActorBucketExtremes(
  candles: CandleBar[],
  extremes: ActorBucketExtremes | null | undefined,
  priceScale: number
): CandleBar[] {
  if (!extremes || candles.length === 0) return candles;
  const idx = candles.findIndex((c) => c.time === extremes.bucketSec);
  if (idx < 0) return candles;
  const row = candles[idx]!;
  const low = Math.min(row.low, extremes.low * priceScale);
  const high = Math.max(row.high, extremes.high * priceScale);
  if (low === row.low && high === row.high) return candles;
  const next = candles.slice();
  next[idx] = { ...row, low, high };
  return next;
}

export type ChartSeriesAction =
  | { type: "reset" }
  | {
      type: "set_fetched";
      candles: CandleBar[];
      volumes: VolumeBar[];
      source: StoredCandleSource;
      interval: CandleInterval;
      gapFilledByApi?: boolean;
    }
  | {
      type: "merge_ws";
      update: CandleWsUpdate;
      priceScale: number;
    }
  | {
      type: "apply_actor";
      actor: ActorOptimisticChartSpot;
      interval: CandleInterval;
      priceScale: number;
    };

export function chartSeriesReducer(
  state: ChartSeriesState,
  action: ChartSeriesAction
): ChartSeriesState {
  switch (action.type) {
    case "reset":
      return initialChartSeriesState;
    case "set_fetched": {
      const preserved = preserveLiveTailOverFetch(
        action.candles,
        action.volumes,
        state.candles,
        state.volumes
      );
      return {
        candles: preserved.candles,
        volumes: preserved.volumes,
        source: action.source,
        interval: action.interval,
        gapFilledByApi: action.gapFilledByApi ?? action.source === "db",
      };
    }
    case "merge_ws": {
      if (state.candles.length === 0) return state;
      const merged = mergeWsCandleUpdate(
        state.candles,
        state.volumes,
        action.update,
        action.priceScale
      );
      return {
        ...state,
        candles: merged.candles,
        volumes: merged.volumes,
        /** Live WS OHLC is authoritative for the open bucket. */
        source: "db",
        /** WS may insert buckets — re-gap on next derive. */
        gapFilledByApi: false,
      };
    }
    case "apply_actor": {
      if (state.candles.length === 0) return state;
      const patched = applyActorOptimisticCandleBucket(
        state.candles,
        state.volumes,
        action.interval,
        action.actor,
        action.priceScale
      );
      const anchor = action.actor.spotAfterBnb * action.priceScale;
      return {
        ...state,
        candles: sanitizeTailCandleSeries(patched.candles, anchor),
        volumes: patched.volumes,
      };
    }
    default:
      return state;
  }
}

export type DeriveChartSeriesInput = {
  state: ChartSeriesState;
  displayInterval: CandleInterval;
  priceScale: number;
  endTimeMs: number;
  /** Live bonding-curve spot from on-chain curves() — pins live bucket close. */
  liveOnChainSpotBnb: number | null;
  actorOptimisticSpot: ActorOptimisticChartSpot | null;
  /** Cumulative in-flight bucket wicks (sell then buy in same bar). */
  actorBucketExtremes?: ActorBucketExtremes | null;
};

/**
 * Native OHLC from DB/WS only.
 * - No bonding-mark pin onto the live bar (wick needles / flat dojis).
 * - No empty wall-clock "live" candle — only buckets that exist from trades/API.
 */
export function deriveChartSeries(input: DeriveChartSeriesInput): {
  candles: CandleBar[];
  volumes: VolumeBar[];
} {
  const {
    state,
    displayInterval,
    priceScale,
    endTimeMs,
    liveOnChainSpotBnb,
    actorOptimisticSpot,
    actorBucketExtremes,
  } = input;

  if (state.interval !== displayInterval || state.candles.length === 0) {
    return { candles: [], volumes: [] };
  }

  let candles = scaleCandleBars(state.candles, priceScale);
  /** Volume stays native — MCAP axis scale must not inflate histogram. */
  let volumes = state.volumes;

  const liveMarkScaled =
    liveOnChainSpotBnb != null && liveOnChainSpotBnb > 0
      ? liveOnChainSpotBnb * priceScale
      : undefined;

  const hasTemporalGaps =
    state.interval != null && seriesHasTemporalGaps(state.candles, state.interval);

  const needsClientGapFill =
    state.source === "trades" ||
    hasTemporalGaps ||
    !state.gapFilledByApi;

  if (needsClientGapFill && state.interval) {
    const filled = fillGapsForStoredCandles(candles, volumes, displayInterval, {
      endTimeMs,
      anchorPrice: liveMarkScaled,
      extendToLive: false,
    });
    candles = filled.candles;
    volumes = filled.volumes;
  }
  // else: keep API/WS series as-is — do not append empty live buckets

  if (actorOptimisticSpot) {
    const patched = applyActorOptimisticCandleBucket(
      candles,
      volumes,
      displayInterval,
      actorOptimisticSpot,
      priceScale
    );
    const anchor = actorOptimisticSpot.spotAfterBnb * priceScale;
    return {
      candles: applyActorBucketExtremes(
        sanitizeTailCandleSeries(patched.candles, anchor),
        actorBucketExtremes,
        priceScale
      ),
      volumes: patched.volumes,
    };
  }

  return {
    candles: applyActorBucketExtremes(candles, actorBucketExtremes, priceScale),
    volumes,
  };
}

/** True when lightweight-charts can patch tail buckets with series.update(). */
export function canSafeIncrementalUpdate(prev: CandleBar[], next: CandleBar[]): boolean {
  if (prev.length === 0 || next.length === 0) return false;
  if (next.length < prev.length) return false;
  if (next.length > prev.length + 1) return false;

  const sharedPrefix = Math.min(prev.length, next.length);
  for (let i = 0; i < sharedPrefix; i++) {
    if (prev[i]!.time !== next[i]!.time) return false;
  }

  if (next.length === prev.length + 1) {
    return next[next.length - 1]!.time > prev[prev.length - 1]!.time;
  }

  return prev.length === 1 || prev[prev.length - 2]!.time === next[next.length - 2]!.time;
}

/** Force setData when consecutive buckets skip interval steps. */
export function needsFullCandleResync(prev: CandleBar[], next: CandleBar[]): boolean {
  if (prev.length === 0 || next.length === 0) return true;
  if (next.length < prev.length) return true;
  if (next.length !== prev.length) return true;
  const n = Math.min(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    if (prev[i]!.time !== next[i]!.time) return true;
  }
  return false;
}

export function incrementalPatchStartIndex(prev: CandleBar[], next: CandleBar[]): number {
  if (next.length > prev.length) return prev.length;
  return Math.max(0, prev.length - 1);
}

/** Accumulate WS candle updates by interval (latest wins per bucket). */
export function mergeWsCandleUpdates(
  prev: CandleWsUpdate[],
  incoming: CandleWsUpdate[]
): CandleWsUpdate[] {
  if (incoming.length === 0) return prev;
  const byKey = new Map<string, CandleWsUpdate>();
  for (const item of prev) {
    byKey.set(`${item.interval}:${item.time}`, item);
  }
  for (const item of incoming) {
    byKey.set(`${item.interval}:${item.time}`, item);
  }
  return [...byKey.values()];
}

/** All buckets for an interval, oldest → newest (safe for sequential merge_ws). */
export function candleUpdatesForIntervalSorted(
  updates: CandleWsUpdate[],
  interval: CandleInterval
): CandleWsUpdate[] {
  return updates
    .filter((item) => item.interval === interval)
    .sort((a, b) => a.time - b.time);
}

/** Newest open-bucket update for an interval — never `.find()` (that picks the oldest). */
export function latestCandleUpdateForInterval(
  updates: CandleWsUpdate[],
  interval: CandleInterval
): CandleWsUpdate | null {
  const sorted = candleUpdatesForIntervalSorted(updates, interval);
  return sorted.length > 0 ? sorted[sorted.length - 1]! : null;
}

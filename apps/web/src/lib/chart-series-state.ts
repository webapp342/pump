import {
  applyActorOptimisticCandleBucket,
  CANDLE_INTERVALS,
  mergeWsCandleUpdate,
  pinTailCandleToLiveMark,
  sanitizeCandleSeries,
  scaleCandleBars,
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
  /** API already ran gap-fill (db path) — skip client regap. */
  gapFilledByApi: boolean;
};

export const initialChartSeriesState: ChartSeriesState = {
  candles: [],
  volumes: [],
  source: "db",
  interval: null,
  gapFilledByApi: false,
};

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
      type: "apply_live";
      liveMarkBnb: number;
      interval: CandleInterval;
      endTimeMs: number;
      priceScale: number;
    }
  | {
      type: "apply_actor";
      actor: ActorOptimisticChartSpot;
      interval: CandleInterval;
      priceScale: number;
    };

/** Extend only the live tail bucket — no full regap when API already gap-filled. */
function extendLiveTailBucket(
  candles: CandleBar[],
  volumes: VolumeBar[],
  interval: CandleInterval,
  endTimeMs: number
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (candles.length === 0) return { candles, volumes };

  const intervalMs = CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 60_000;
  const liveBucketSec = Math.floor(endTimeMs / intervalMs) * (intervalMs / 1000);
  const last = candles[candles.length - 1]!;

  if (liveBucketSec <= last.time) return { candles, volumes };

  const flat = last.close;
  const nextCandles = candles.slice();
  const nextVolumes = volumes.slice();
  for (let t = last.time + intervalMs / 1000; t <= liveBucketSec; t += intervalMs / 1000) {
    nextCandles.push({ time: t, open: flat, high: flat, low: flat, close: flat });
    nextVolumes.push({
      time: t,
      value: 0,
      color: "rgba(128, 128, 128, 0.15)",
    });
  }
  return { candles: nextCandles, volumes: nextVolumes };
}

export function chartSeriesReducer(
  state: ChartSeriesState,
  action: ChartSeriesAction
): ChartSeriesState {
  switch (action.type) {
    case "reset":
      return initialChartSeriesState;
    case "set_fetched":
      return {
        candles: action.candles,
        volumes: action.volumes,
        source: action.source,
        interval: action.interval,
        gapFilledByApi: action.gapFilledByApi ?? action.source === "db",
      };
    case "merge_ws": {
      if (state.source !== "db" || state.candles.length === 0) return state;
      const merged = mergeWsCandleUpdate(
        state.candles,
        state.volumes,
        action.update,
        action.priceScale
      );
      return { ...state, candles: merged.candles, volumes: merged.volumes };
    }
    case "apply_live": {
      if (state.candles.length === 0) return state;
      let candles = state.candles;
      let volumes = state.volumes;
      if (state.gapFilledByApi) {
        const extended = extendLiveTailBucket(
          candles,
          volumes,
          action.interval,
          action.endTimeMs
        );
        candles = extended.candles;
        volumes = extended.volumes;
      }
      const pinned = pinTailCandleToLiveMark(
        candles,
        volumes,
        action.liveMarkBnb,
        action.interval,
        action.endTimeMs
      );
      return {
        ...state,
        candles: sanitizeCandleSeries(
          pinned.candles,
          action.liveMarkBnb * action.priceScale
        ),
        volumes: pinned.volumes,
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
        candles: sanitizeCandleSeries(patched.candles, anchor),
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
  liveMarkPriceBnb: number | null;
  actorOptimisticSpot: ActorOptimisticChartSpot | null;
};

/** Scale + live mark + actor optimistic — single derived view for the chart. */
export function deriveChartSeries(input: DeriveChartSeriesInput): {
  candles: CandleBar[];
  volumes: VolumeBar[];
} {
  const {
    state,
    displayInterval,
    priceScale,
    endTimeMs,
    liveMarkPriceBnb,
    actorOptimisticSpot,
  } = input;

  if (state.interval !== displayInterval || state.candles.length === 0) {
    return { candles: [], volumes: [] };
  }

  let candles = scaleCandleBars(state.candles, priceScale);
  let volumes =
    priceScale === 1
      ? state.volumes
      : state.volumes.map((v) => ({ ...v, value: v.value * priceScale }));

  if (liveMarkPriceBnb != null && liveMarkPriceBnb > 0) {
    let working = candles;
    let workingVolumes = volumes;
    if (state.gapFilledByApi) {
      const extended = extendLiveTailBucket(
        working,
        workingVolumes,
        displayInterval,
        endTimeMs
      );
      working = extended.candles;
      workingVolumes = extended.volumes;
    }
    const pinned = pinTailCandleToLiveMark(
      working,
      workingVolumes,
      liveMarkPriceBnb * priceScale,
      displayInterval,
      endTimeMs
    );
    candles = pinned.candles;
    volumes = pinned.volumes;
  }

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
      candles: sanitizeCandleSeries(patched.candles, anchor),
      volumes: patched.volumes,
    };
  }

  if (liveMarkPriceBnb != null && liveMarkPriceBnb > 0) {
    return {
      candles: sanitizeCandleSeries(candles, liveMarkPriceBnb * priceScale),
      volumes,
    };
  }

  return { candles, volumes };
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

/** Force setData when OHLC values jump (e.g. decade-scale reconcile). */
export function needsFullCandleResync(prev: CandleBar[], next: CandleBar[]): boolean {
  const n = Math.min(prev.length, next.length);
  for (let i = Math.max(0, n - 5); i < n; i++) {
    const p = prev[i]!.close;
    const q = next[i]!.close;
    if (!Number.isFinite(p) || !Number.isFinite(q) || p <= 0 || q <= 0) continue;
    if (Math.abs(Math.log10(q / p)) > 0.08) return true;
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

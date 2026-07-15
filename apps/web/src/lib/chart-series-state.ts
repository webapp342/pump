import {
  applyActorOptimisticCandleBucket,
  extendSeriesToLiveBucket,
  fillGapsForStoredCandles,
  mergeWsCandleUpdate,
  pinTailCandleToLiveMark,
  sanitizeTailCandleSeries,
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
};

/**
 * Native OHLC from DB/WS + live tail pinned to on-chain spot.
 * USD = native × nativeUsd in chart formatters only.
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
  } = input;

  if (state.interval !== displayInterval || state.candles.length === 0) {
    return { candles: [], volumes: [] };
  }

  let candles = scaleCandleBars(state.candles, priceScale);
  /** Volume stays native — MCAP axis scale must not inflate histogram. */
  let volumes = state.volumes;

  if (!state.gapFilledByApi && state.source === "trades") {
    const filled = fillGapsForStoredCandles(candles, volumes, displayInterval, {
      endTimeMs,
    });
    candles = filled.candles;
    volumes = filled.volumes;
  } else {
    const extended = extendSeriesToLiveBucket(
      candles,
      volumes,
      displayInterval,
      endTimeMs
    );
    candles = extended.candles;
    volumes = extended.volumes;
  }

  if (liveOnChainSpotBnb != null && liveOnChainSpotBnb > 0 && !actorOptimisticSpot) {
    const pinned = pinTailCandleToLiveMark(
      candles,
      volumes,
      liveOnChainSpotBnb * priceScale,
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
      candles: sanitizeTailCandleSeries(patched.candles, anchor),
      volumes: patched.volumes,
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

/** Force setData when consecutive buckets skip interval steps. */
export function needsFullCandleResync(prev: CandleBar[], next: CandleBar[]): boolean {
  if (prev.length === 0 || next.length === 0) return true;
  if (next.length < prev.length) return true;
  const n = Math.min(prev.length, next.length);
  for (let i = 1; i < n; i++) {
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

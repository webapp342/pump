import { parseEther } from "viem";
import type { TradeItem } from "@/lib/db/launchpad";
import {
  DEFAULT_VIRTUAL_TOKEN_RESERVE,
  DEFAULT_VIRTUAL_ZUG_RESERVE,
  spotPriceZugFromReserves,
} from "@/lib/bonding-curve";

/** Fallback when WS/indexer trade rows omit fee_zug (chart spot replay). */
const CHART_FEE_ESTIMATE_BPS = 100n;
const FEE_BPS_DENOMINATOR = 10_000n;

export type CandleInterval = "15s" | "1m" | "5m" | "15m" | "1h" | "4h";

export const CANDLE_INTERVALS: { id: CandleInterval; label: string; ms: number }[] = [
  { id: "15s", label: "15s", ms: 15_000 },
  { id: "1m", label: "1m", ms: 60_000 },
  { id: "5m", label: "5m", ms: 5 * 60_000 },
  { id: "15m", label: "15m", ms: 15 * 60_000 },
  { id: "1h", label: "1h", ms: 60 * 60_000 },
  { id: "4h", label: "4h", ms: 4 * 60 * 60_000 },
];

export type CandleBar = {
  /** Unix seconds (UTC) — lightweight-charts UTCTimestamp */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type VolumeBar = {
  time: number;
  value: number;
  color: string;
};

export type CandleWsUpdate = {
  interval: CandleInterval;
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  buyVolume: string;
  tradeCount: number;
  isNewBucket: boolean;
};

export type StoredCandleSource = "db" | "trades";

export type ChartTradePoint = {
  priceBnb: number;
  blockTimeMs: number;
  volumeBnb: number;
  isBuy: boolean;
};

export type TradeSpotTick = {
  id: string;
  before: number;
  after: number;
};

/**
 * Replay bonding-curve reserve state to derive spot price ticks.
 * Charts use spot (not per-trade average execution price) — avoids giant wicks on large buys/sells.
 */
export function buildTradeSpotTicks(
  trades: TradeItem[],
  virtualZugReserve = DEFAULT_VIRTUAL_ZUG_RESERVE,
  virtualTokenReserve = DEFAULT_VIRTUAL_TOKEN_RESERVE,
  protocolFeeBps = CHART_FEE_ESTIMATE_BPS
): Map<string, TradeSpotTick> {
  const ticks = new Map<string, TradeSpotTick>();
  let reserve = 0n;
  let sold = 0n;

  for (const trade of sortTradesChronologically(trades)) {
    const before = spotPriceZugFromReserves(
      reserve,
      sold,
      virtualZugReserve,
      virtualTokenReserve
    );

    const zug = parseEther(trade.nativeAmount as `${number}`);
    const fee = resolveTradeFeeWei(trade, protocolFeeBps);
    const tokens = parseEther(trade.tokenAmount as `${number}`);

    if (trade.side === "BUY") {
      reserve += zug - fee;
      sold += tokens;
    } else {
      reserve -= zug;
      sold -= tokens;
    }

    const after =
      trade.spotPriceBnb != null &&
      Number.isFinite(Number(trade.spotPriceBnb)) &&
      Number(trade.spotPriceBnb) > 0
        ? Number(trade.spotPriceBnb)
        : spotPriceZugFromReserves(
            reserve,
            sold,
            virtualZugReserve,
            virtualTokenReserve
          );
    ticks.set(trade.id, { id: trade.id, before, after });
  }

  return ticks;
}

/** Latest bonding-curve spot (BNB per token) after replaying trades chronologically. */
export function resolveLatestSpotPriceBnb(trades: TradeItem[]): number | null {
  if (trades.length === 0) return null;

  const chronological = [...trades].sort(
    (a, b) => new Date(a.blockTime).getTime() - new Date(b.blockTime).getTime()
  );
  const ticks = buildTradeSpotTicks(chronological);
  const last = chronological[chronological.length - 1]!;
  const tick = ticks.get(last.id);
  if (tick && tick.after > 0) return tick.after;

  const exec = Number(last.priceBnb);
  return Number.isFinite(exec) && exec > 0 ? exec : null;
}

function tradeVolumeBnb(trade: TradeItem): number {
  if (trade.netBnb != null) return Math.max(0, Number(trade.netBnb));
  const gross = Number(trade.nativeAmount);
  const fee = Number(trade.feeBnb ?? 0);
  return Math.max(0, gross - fee);
}

export function tradeToChartPoint(
  trade: TradeItem,
  spot?: TradeSpotTick
): ChartTradePoint | null {
  const blockTimeMs = new Date(trade.blockTime).getTime();
  const price = spot?.after ?? Number(trade.priceBnb);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(blockTimeMs)) {
    return null;
  }
  return {
    priceBnb: price,
    blockTimeMs,
    volumeBnb: tradeVolumeBnb(trade),
    isBuy: trade.side === "BUY",
  };
}

/** Dedupe by tx+log index id; sort ascending by time. */
export function mergeTradesForChart(dbTrades: TradeItem[], optimistic: TradeItem[]): TradeItem[] {
  const byId = new Map<string, TradeItem>();
  for (const trade of dbTrades) {
    byId.set(trade.id, trade);
  }
  for (const trade of optimistic) {
    if (!byId.has(trade.id)) {
      byId.set(trade.id, trade);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.blockTime).getTime() - new Date(b.blockTime).getTime()
  );
}

export type BuildCandlesOptions = {
  /** Fill empty intervals with flat candles at last close (pump.fun style). */
  fillGaps?: boolean;
  /** Last bucket time (ms). Defaults to now for live charts. */
  endTimeMs?: number;
  /** Use bonding-curve spot price instead of per-trade average execution price. */
  useSpotPrice?: boolean;
  /** Max flat candles after the last trade when filling gaps (avoids long dead tails). */
  maxGapBarsAfterLastTrade?: number;
  virtualZugReserve?: bigint;
  virtualTokenReserve?: bigint;
  protocolFeeBps?: bigint;
};

export function sortTradesChronologically(trades: TradeItem[]): TradeItem[] {
  return [...trades].sort(
    (a, b) => new Date(a.blockTime).getTime() - new Date(b.blockTime).getTime()
  );
}

function resolveTradeFeeWei(trade: TradeItem, protocolFeeBps = CHART_FEE_ESTIMATE_BPS): bigint {
  if (trade.feeBnb != null && trade.feeBnb !== "") {
    try {
      return parseEther(trade.feeBnb as `${number}`);
    } catch {
      // fall through to estimate
    }
  }
  try {
    const gross = parseEther(trade.nativeAmount as `${number}`);
    return (gross * protocolFeeBps) / FEE_BPS_DENOMINATOR;
  } catch {
    return 0n;
  }
}

const MAX_CANDLES = 4000;

function gapTailBarsForInterval(interval: CandleInterval): number {
  switch (interval) {
    case "15s":
      return 8;
    case "1m":
      return 6;
    case "5m":
      return 4;
    default:
      return 2;
  }
}

export function buildCandlesFromTrades(
  trades: TradeItem[],
  interval: CandleInterval,
  priceScale = 1,
  options: BuildCandlesOptions = {}
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  const intervalMs = CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 5 * 60_000;
  const intervalSec = intervalMs / 1000;
  const fillGaps = options.fillGaps !== false;
  const useSpotPrice = options.useSpotPrice !== false;
  const endTimeMs = options.endTimeMs ?? Date.now();
  const virtualZugReserve = options.virtualZugReserve ?? DEFAULT_VIRTUAL_ZUG_RESERVE;
  const virtualTokenReserve = options.virtualTokenReserve ?? DEFAULT_VIRTUAL_TOKEN_RESERVE;
  const protocolFeeBps = options.protocolFeeBps ?? CHART_FEE_ESTIMATE_BPS;
  const chronological = sortTradesChronologically(trades);
  const spotTicks = useSpotPrice
    ? buildTradeSpotTicks(
        chronological,
        virtualZugReserve,
        virtualTokenReserve,
        protocolFeeBps
      )
    : null;

  if (chronological.length === 0) {
    return { candles: [], volumes: [] };
  }

  let priorClose: number | null = null;

  const buckets = new Map<
    number,
    { open: number; high: number; low: number; close: number; volume: number; buyVol: number }
  >();

  for (const trade of chronological) {
    const spot = spotTicks?.get(trade.id);
    const point = tradeToChartPoint(trade, spot);
    if (!point) continue;
    const bucketTime = Math.floor(point.blockTimeMs / intervalMs) * intervalMs;
    const bucketSec = Math.floor(bucketTime / 1000);
    const closePrice = (spot?.after ?? point.priceBnb) * priceScale;
    const touchPrices = spot
      ? [spot.before * priceScale, spot.after * priceScale]
      : [closePrice];

    const existing = buckets.get(bucketSec);
    if (!existing) {
      const spotOpen = touchPrices[0] ?? closePrice;
      const open =
        priorClose != null
          ? priorClose
          : spotOpen;
      buckets.set(bucketSec, {
        open,
        high: Math.max(open, ...touchPrices),
        low: Math.min(open, ...touchPrices),
        close: closePrice,
        volume: point.volumeBnb,
        buyVol: point.isBuy ? point.volumeBnb : 0,
      });
    } else {
      existing.high = Math.max(existing.high, ...touchPrices);
      existing.low = Math.min(existing.low, ...touchPrices);
      existing.close = closePrice;
      existing.volume += point.volumeBnb;
      if (point.isBuy) existing.buyVol += point.volumeBnb;
    }
    priorClose = buckets.get(bucketSec)!.close;
  }

  if (buckets.size === 0) {
    return { candles: [], volumes: [] };
  }

  const sortedTimes = [...buckets.keys()].sort((a, b) => a - b);

  if (!fillGaps || sortedTimes.length === 0) {
    const candles: CandleBar[] = [];
    const volumes: VolumeBar[] = [];
    for (const time of sortedTimes) {
      const b = buckets.get(time)!;
      candles.push({
        time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      });
      const buyHeavy = b.buyVol >= b.volume / 2;
      volumes.push({
        time,
        value: b.volume,
        color: buyHeavy ? "rgba(74, 222, 128, 0.5)" : "rgba(248, 113, 113, 0.5)",
      });
    }
    return { candles, volumes };
  }

  let startSec = sortedTimes[0]!;
  const lastTradeSec = sortedTimes[sortedTimes.length - 1]!;
  const endBucketMs = Math.floor(endTimeMs / intervalMs) * intervalMs;
  const liveEndSec = Math.floor(endBucketMs / 1000);
  const endSec = Math.max(lastTradeSec, liveEndSec);

  const span = Math.floor((endSec - startSec) / intervalSec) + 1;
  if (span > MAX_CANDLES) {
    // Keep the most recent window — older 15s intervals were dropping new trades.
    startSec = endSec - (MAX_CANDLES - 1) * intervalSec;
  }

  const candles: CandleBar[] = [];
  const volumes: VolumeBar[] = [];
  let lastClose: number | null = null;
  for (const t of sortedTimes) {
    if (t < startSec) {
      lastClose = buckets.get(t)!.close;
    }
  }

  for (let t = startSec; t <= endSec; t += intervalSec) {
    const b = buckets.get(t);
    if (b) {
      candles.push({
        time: t,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      });
      const buyHeavy = b.buyVol >= b.volume / 2;
      volumes.push({
        time: t,
        value: b.volume,
        color: buyHeavy ? "rgba(74, 222, 128, 0.5)" : "rgba(248, 113, 113, 0.5)",
      });
      lastClose = b.close;
    } else if (lastClose != null) {
      candles.push({
        time: t,
        open: lastClose,
        high: lastClose,
        low: lastClose,
        close: lastClose,
      });
      volumes.push({
        time: t,
        value: 0,
        color: "rgba(128, 128, 128, 0.15)",
      });
    }
  }

  return { candles, volumes };
}

function volumeBarColor(volume: number, buyVolume: number): string {
  if (volume <= 0) return "rgba(128, 128, 128, 0.15)";
  const buyHeavy = buyVolume >= volume / 2;
  return buyHeavy ? "rgba(74, 222, 128, 0.5)" : "rgba(248, 113, 113, 0.5)";
}

export function storedCandlesToBars(
  rows: {
    bucketSec: number;
    openZug: string;
    highZug: string;
    lowZug: string;
    closeZug: string;
    volumeZug: string;
    buyVolumeZug: string;
  }[],
  priceScale = 1
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  const candles: CandleBar[] = [];
  const volumes: VolumeBar[] = [];

  for (const row of rows) {
    const open = Number(row.openZug) * priceScale;
    const high = Number(row.highZug) * priceScale;
    const low = Number(row.lowZug) * priceScale;
    const close = Number(row.closeZug) * priceScale;
    const volume = Number(row.volumeZug) * priceScale;
    const buyVolume = Number(row.buyVolumeZug) * priceScale;
    if (!Number.isFinite(close) || close <= 0) continue;

    candles.push({
      time: row.bucketSec,
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(high) ? high : close,
      low: Number.isFinite(low) ? low : close,
      close,
    });
    volumes.push({
      time: row.bucketSec,
      value: Number.isFinite(volume) ? volume : 0,
      color: volumeBarColor(volume, buyVolume),
    });
  }

  return { candles, volumes };
}

/** Gap-fill flat candles between stored buckets (pump.fun style). */
export function fillGapsForStoredCandles(
  candles: CandleBar[],
  volumes: VolumeBar[],
  interval: CandleInterval,
  options: {
    endTimeMs?: number;
    maxGapBarsAfterLastTrade?: number;
    /** Live bonding mark — gap-fill forward close is validated against this. */
    anchorPrice?: number;
  } = {}
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (candles.length === 0) return { candles, volumes };

  const intervalMs = CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 5 * 60_000;
  const intervalSec = intervalMs / 1000;
  const endTimeMs = options.endTimeMs ?? Date.now();
  const anchorPrice = options.anchorPrice;

  const volumeByTime = new Map(volumes.map((v) => [v.time, v]));
  const sortedTimes = candles.map((c) => c.time).sort((a, b) => a - b);
  const lastTradeSec = sortedTimes[sortedTimes.length - 1]!;
  const endBucketMs = Math.floor(endTimeMs / intervalMs) * intervalMs;
  const liveEndSec = Math.floor(endBucketMs / 1000);
  const endSec = Math.max(lastTradeSec, liveEndSec);

  let startSec = sortedTimes[0]!;
  const span = Math.floor((endSec - startSec) / intervalSec) + 1;
  if (span > MAX_CANDLES) {
    startSec = endSec - (MAX_CANDLES - 1) * intervalSec;
  }

  const bucketByTime = new Map(candles.map((c) => [c.time, c]));
  const nextCandles: CandleBar[] = [];
  const nextVolumes: VolumeBar[] = [];
  let lastClose: number | null = null;

  for (const t of sortedTimes) {
    if (t < startSec) {
      lastClose = coherentGapClose(bucketByTime.get(t)!.close, anchorPrice);
    }
  }

  for (let t = startSec; t <= endSec; t += intervalSec) {
    const existing = bucketByTime.get(t);
    if (existing) {
      nextCandles.push(existing);
      nextVolumes.push(
        volumeByTime.get(t) ?? {
          time: t,
          value: 0,
          color: volumeBarColor(0, 0),
        }
      );
      lastClose = existing.close;
      continue;
    }
    if (lastClose == null) continue;
    // Always carry forward last close — pump.fun flat line between trades.
    const flat = coherentGapClose(lastClose, anchorPrice);
    nextCandles.push({
      time: t,
      open: flat,
      high: flat,
      low: flat,
      close: flat,
    });
    nextVolumes.push({
      time: t,
      value: 0,
      color: volumeBarColor(0, 0),
    });
    lastClose = flat;
  }

  return { candles: nextCandles, volumes: nextVolumes };
}

/**
 * Append flat native buckets from the last candle through the live interval bucket.
 * Lightweight alternative to full gap-fill when SQL/API already delivered a dense series.
 */
export function extendSeriesToLiveBucket(
  candles: CandleBar[],
  volumes: VolumeBar[],
  interval: CandleInterval,
  endTimeMs: number
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (candles.length === 0) return { candles, volumes };

  const intervalMs = CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 60_000;
  const intervalSec = intervalMs / 1000;
  const liveBucketSec = Math.floor(endTimeMs / intervalMs) * (intervalMs / 1000);
  const last = candles[candles.length - 1]!;
  if (last.time >= liveBucketSec) return { candles, volumes };

  const lastClose = last.close;
  const nextCandles = candles.slice();
  const nextVolumes = volumes.slice();

  for (let t = last.time + intervalSec; t <= liveBucketSec; t += intervalSec) {
    nextCandles.push({
      time: t,
      open: lastClose,
      high: lastClose,
      low: lastClose,
      close: lastClose,
    });
    nextVolumes.push({
      time: t,
      value: 0,
      color: volumeBarColor(0, 0),
    });
  }

  return { candles: nextCandles, volumes: nextVolumes };
}

/** True when consecutive buckets skip one or more interval steps (sparse DB series). */
export function seriesHasTemporalGaps(
  candles: CandleBar[],
  interval: CandleInterval
): boolean {
  if (candles.length < 2) return false;
  const intervalSec =
    (CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 60_000) / 1000;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i]!.time - candles[i - 1]!.time > intervalSec) return true;
  }
  return false;
}

/**
 * Expand sub-pixel OHLC spans so lightweight-charts renders bodies on micro-cap prices.
 * Flat gap-fill bars (open=high=low=close) are left unchanged.
 */
export function ensureVisibleCandleBodies(candles: CandleBar[]): CandleBar[] {
  return candles.map((c) => {
    if (c.open === c.high && c.high === c.low && c.low === c.close) return c;
    const anchor = Math.max(c.open, c.close, c.high, c.low);
    if (!Number.isFinite(anchor) || anchor <= 0) return c;
    const bodySpan = Math.abs(c.close - c.open);
    const wickSpan = c.high - c.low;
    const minSpan = anchor * 1e-5;
    if (wickSpan >= minSpan && bodySpan >= minSpan * 0.25) return c;
    const half = Math.max(minSpan / 2, bodySpan / 2);
    const mid = (c.open + c.close) / 2;
    return {
      time: c.time,
      open: c.open,
      close: c.close,
      high: Math.max(c.high, c.open, c.close, mid + half),
      low: Math.min(c.low, c.open, c.close, mid - half),
    };
  });
}

export function wsCandleUpdateToBars(
  update: CandleWsUpdate,
  priceScale = 1
): { candle: CandleBar; volume: VolumeBar } {
  const open = Number(update.open) * priceScale;
  const high = Number(update.high) * priceScale;
  const low = Number(update.low) * priceScale;
  const close = Number(update.close) * priceScale;
  const volume = Number(update.volume) * priceScale;
  const buyVolume = Number(update.buyVolume) * priceScale;

  return {
    candle: {
      time: update.time,
      open,
      high,
      low,
      close,
    },
    volume: {
      time: update.time,
      value: volume,
      color: volumeBarColor(volume, buyVolume),
    },
  };
}

/** Patch or append a live WS candle bucket without full setData rebuild. */
export function mergeWsCandleUpdate(
  candles: CandleBar[],
  volumes: VolumeBar[],
  update: CandleWsUpdate,
  priceScale = 1
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  const { candle, volume } = wsCandleUpdateToBars(update, priceScale);
  if (!Number.isFinite(candle.close) || candle.close <= 0) {
    return { candles, volumes };
  }

  if (candles.length === 0) {
    return { candles: [candle], volumes: [volume] };
  }

  const last = candles[candles.length - 1]!;
  if (update.isNewBucket && candle.time > last.time) {
    const priorClose = last.close;
    const patched: CandleBar = {
      ...candle,
      open: priorClose,
      high: Math.max(candle.high, priorClose),
      low: Math.min(candle.low, priorClose),
    };
    return {
      candles: [...candles, patched],
      volumes: [...volumes, volume],
    };
  }

  const idx = candles.findIndex((c) => c.time === candle.time);
  if (idx >= 0) {
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    const priorOpen = candles[idx]!.open;
    nextCandles[idx] = { ...candle, open: priorOpen };
    if (idx < nextVolumes.length) nextVolumes[idx] = volume;
    else nextVolumes.push(volume);
    return { candles: nextCandles, volumes: nextVolumes };
  }

  if (candle.time === last.time) {
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    nextCandles[nextCandles.length - 1] = { ...candle, open: last.open };
    if (nextVolumes.length > 0) {
      nextVolumes[nextVolumes.length - 1] = volume;
    } else {
      nextVolumes.push(volume);
    }
    return { candles: nextCandles, volumes: nextVolumes };
  }

  return { candles, volumes };
}

/** Trader-only optimistic candle patch (client-side; not broadcast on WS). */
export type ActorOptimisticChartSpot = {
  spotBeforeBnb: number;
  spotAfterBnb: number;
  side: "buy" | "sell";
  volumeBnb: number;
  blockTimeMs: number;
};

/** Pure computation of the optimistic bar + volume for a given actor trade.
 * Can be used both for full derive and for direct series.update() instant feedback. */
export function createOptimisticCandleBar(
  actor: ActorOptimisticChartSpot,
  interval: CandleInterval,
  previousCloseHint?: number,
  priceScale = 1
): { candle: CandleBar; volume: VolumeBar } | null {
  const after = actor.spotAfterBnb * priceScale;
  const before = actor.spotBeforeBnb * priceScale;
  const tradeVol = Math.max(0, actor.volumeBnb * priceScale);
  if (!Number.isFinite(after) || after <= 0) return null;

  const intervalMs = CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 60_000;
  const bucketSec = Math.floor(actor.blockTimeMs / intervalMs) * (intervalMs / 1000);

  let open = before > 0 ? before : after;
  if (previousCloseHint != null && previousCloseHint > 0) {
    // Prefer the actual previous close in the series if provided (for correct open on new bar)
    open = previousCloseHint;
  }
  if (actor.side === "buy" && after < open) open = after;
  if (actor.side === "sell" && after > open) open = after;

  const touch = [open, before > 0 ? before : open, after];
  const high = Math.max(...touch);
  const low = Math.min(...touch);

  const candle: CandleBar = { time: bucketSec, open, high, low, close: after };
  const volBar: VolumeBar = {
    time: bucketSec,
    value: tradeVol,
    color: volumeBarColor(tradeVol, actor.side === "buy" ? tradeVol : 0),
  };
  return { candle, volume: volBar };
}

/**
 * Upsert the actor's in-flight trade into the active interval bucket.
 * Works with DB-backed candles — does not require trade replay.
 * Now uses the pure creator + merges volume correctly against existing.
 */
export function applyActorOptimisticCandleBucket(
  candles: CandleBar[],
  volumes: VolumeBar[],
  interval: CandleInterval,
  actor: ActorOptimisticChartSpot,
  priceScale = 1
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  const after = actor.spotAfterBnb * priceScale;
  const before = actor.spotBeforeBnb * priceScale;
  const tradeVol = Math.max(0, actor.volumeBnb * priceScale);
  if (!Number.isFinite(after) || after <= 0) {
    return { candles, volumes };
  }

  const intervalMs = CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 60_000;
  const bucketSec = Math.floor(actor.blockTimeMs / intervalMs) * (intervalMs / 1000);
  const idx = candles.findIndex((c) => c.time === bucketSec);
  const last = candles[candles.length - 1];

  // Determine the open we should use for this optimistic bar
  let openBase = before > 0 ? before : after;
  if (idx >= 0) {
    openBase = candles[idx]!.open;
  } else if (last) {
    openBase = last.close;
  }

  const opt = createOptimisticCandleBar(actor, interval, openBase, priceScale);
  if (!opt) return { candles, volumes };

  const { candle: patched, volume: baseVol } = opt;

  // Accumulate volume if the bucket already had some (from WS or previous optimistic)
  const prevVol = idx >= 0 ? (volumes[idx]?.value ?? 0) : 0;
  const nextVol = prevVol + tradeVol;
  const volBar: VolumeBar = {
    time: bucketSec,
    value: nextVol,
    color: volumeBarColor(nextVol, actor.side === "buy" ? nextVol : 0),
  };

  if (idx >= 0) {
    const existing = candles[idx]!;
    const priorClose = idx > 0 ? candles[idx - 1]!.close : undefined;
    const open = coherentOpenForBar(existing.open, after, before > 0 ? before : priorClose);
    const merged = sanitizeCandleOhlc(
      {
        time: bucketSec,
        open,
        high: Math.max(existing.high, patched.high),
        low: Math.min(existing.low, patched.low),
        close: after,
      },
      after
    );
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    nextCandles[idx] = merged;
    nextVolumes[idx] = volBar;
    return { candles: nextCandles, volumes: nextVolumes };
  }

  if (!last || bucketSec > last.time) {
    return {
      candles: [...candles, patched],
      volumes: [...volumes, volBar],
    };
  }

  if (bucketSec === last.time) {
    const priorClose = candles.length > 1 ? candles[candles.length - 2]!.close : undefined;
    const open = coherentOpenForBar(last.open, after, before > 0 ? before : priorClose);
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    nextCandles[nextCandles.length - 1] = sanitizeCandleOhlc(
      {
        time: last.time,
        open,
        high: Math.max(last.high, patched.high),
        low: Math.min(last.low, patched.low),
        close: after,
      },
      after
    );
    nextVolumes[nextVolumes.length - 1] = volBar;
    return { candles: nextCandles, volumes: nextVolumes };
  }

  if (bucketSec < last.time) {
    return applyActorOptimisticSpotToCandles(candles, volumes, after, actor.side);
  }

  return { candles, volumes };
}

const OHLC_MAGNITUDE_LOG_EPS = 0.35;
const DECADE_RESCALE_LOG_EPS = OHLC_MAGNITUDE_LOG_EPS + 0.1;

/** Whether two spot prices are on the same decade scale (guards stale 1000× DB OHLC). */
export function pricesSameMagnitude(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return true;
  return Math.abs(Math.log10(a / b)) <= OHLC_MAGNITUDE_LOG_EPS;
}

function coherentOpenForBar(
  existingOpen: number,
  anchor: number,
  fallback?: number
): number {
  if (Number.isFinite(existingOpen) && existingOpen > 0 && pricesSameMagnitude(existingOpen, anchor)) {
    return existingOpen;
  }
  if (
    fallback != null &&
    Number.isFinite(fallback) &&
    fallback > 0 &&
    pricesSameMagnitude(fallback, anchor)
  ) {
    return fallback;
  }
  return anchor;
}

/** Snap a price onto the anchor decade when it is ~10^n off (stale fill vs spot rows). */
export function rescalePriceToAnchor(price: number, anchor: number): number {
  if (!Number.isFinite(price) || price <= 0) return price;
  if (!Number.isFinite(anchor) || anchor <= 0) return price;
  if (pricesSameMagnitude(price, anchor)) return price;

  const logRatio = Math.log10(price / anchor);
  const decade = Math.round(logRatio);
  if (Math.abs(decade) < 1 || Math.abs(logRatio - decade) > DECADE_RESCALE_LOG_EPS) {
    return price;
  }

  const scaled = price / Math.pow(10, decade);
  return Number.isFinite(scaled) && scaled > 0 ? scaled : price;
}

function coherentGapClose(price: number, anchor?: number): number {
  if (anchor == null || !Number.isFinite(anchor) || anchor <= 0) return price;
  return rescalePriceToAnchor(price, anchor);
}

/** Drop OHLC legs on a different magnitude than anchor (prevents giant bear wicks). */
export function sanitizeCandleOhlc(bar: CandleBar, anchor: number): CandleBar {
  if (!Number.isFinite(anchor) || anchor <= 0) return bar;

  const pick = (p: number, fallback: number): number =>
    Number.isFinite(p) && p > 0 && pricesSameMagnitude(p, anchor) ? p : fallback;

  const close = pick(bar.close, anchor);
  const open = pick(bar.open, close);
  const high = Math.max(pick(bar.high, close), open, close);
  const low = Math.min(pick(bar.low, close), open, close);
  return { time: bar.time, open, high, low, close };
}

export function sanitizeCandleSeries(candles: CandleBar[], anchor: number): CandleBar[] {
  if (candles.length === 0 || !Number.isFinite(anchor) || anchor <= 0) return candles;
  return candles.map((c) => sanitizeCandleOhlc(c, anchor));
}

/** Sanitize only the live tail — avoid collapsing historical OHLC against the header mark. */
export function sanitizeTailCandleSeries(candles: CandleBar[], anchor: number): CandleBar[] {
  if (candles.length === 0 || !Number.isFinite(anchor) || anchor <= 0) return candles;
  const next = candles.slice();
  next[next.length - 1] = sanitizeCandleOhlc(next[next.length - 1]!, anchor);
  return next;
}

export function scaleCandleBars(candles: CandleBar[], scale: number): CandleBar[] {
  if (scale === 1) return candles;
  return candles.map((c) => ({
    time: c.time,
    open: c.open * scale,
    high: c.high * scale,
    low: c.low * scale,
    close: c.close * scale,
  }));
}

/**
 * Correct decade-scale drift between stored candles and live bonding mark (e.g. 1000×).
 * Per-bar rescale keeps already-correct tail buckets while fixing stale DB / gap-fill rows.
 */
export function reconcileCandleSeriesToLiveMark(
  candles: CandleBar[],
  volumes: VolumeBar[],
  liveMarkBnb: number
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (candles.length === 0 || !Number.isFinite(liveMarkBnb) || liveMarkBnb <= 0) {
    return { candles, volumes };
  }

  let changed = false;
  const nextCandles = candles.map((bar) => {
    const open = rescalePriceToAnchor(bar.open, liveMarkBnb);
    const high = rescalePriceToAnchor(bar.high, liveMarkBnb);
    const low = rescalePriceToAnchor(bar.low, liveMarkBnb);
    const close = rescalePriceToAnchor(bar.close, liveMarkBnb);
    if (open === bar.open && high === bar.high && low === bar.low && close === bar.close) {
      return bar;
    }
    changed = true;
    return sanitizeCandleOhlc(
      { time: bar.time, open, high, low, close },
      liveMarkBnb
    );
  });

  return changed ? { candles: nextCandles, volumes } : { candles, volumes };
}

/** Keep the live interval bucket aligned with header / tape mark price. */
export function pinTailCandleToLiveMark(
  candles: CandleBar[],
  volumes: VolumeBar[],
  liveMarkBnb: number,
  interval: CandleInterval,
  endTimeMs: number
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (candles.length === 0 || !Number.isFinite(liveMarkBnb) || liveMarkBnb <= 0) {
    return { candles, volumes };
  }

  const intervalMs = CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 60_000;
  const liveBucketSec = Math.floor(endTimeMs / intervalMs) * (intervalMs / 1000);
  const liveIdx = candles.findIndex((c) => c.time === liveBucketSec);
  const targetIdx = liveIdx >= 0 ? liveIdx : candles.length - 1;
  const existing = candles[targetIdx];
  if (!existing) return { candles, volumes };

  const bucketVolume = volumes[targetIdx]?.value ?? 0;
  const isLiveBucket = existing.time === liveBucketSec;
  if (!isLiveBucket) {
    return { candles, volumes };
  }

  const priorClose = targetIdx > 0 ? candles[targetIdx - 1]!.close : undefined;
  const close = liveMarkBnb;
  const openSeed =
    bucketVolume > 0 ? existing.open : (priorClose ?? existing.open);
  const open = coherentOpenForBar(openSeed, close, priorClose);
  const nextCandles = candles.slice();
  nextCandles[targetIdx] = sanitizeCandleOhlc(
    {
      time: existing.time,
      open,
      high: Math.max(existing.high, open, close),
      low: Math.min(existing.low, open, close),
      close,
    },
    close
  );
  return { candles: nextCandles, volumes };
}

/**
 * Pin the actor's optimistic spot on the live candle (trader-only).
 * Never pulls close below open on buys or above open on sells.
 */
export function applyActorOptimisticSpotToCandles(
  candles: CandleBar[],
  volumes: VolumeBar[],
  spotAfterScaled: number,
  side: "buy" | "sell"
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (
    candles.length === 0 ||
    !Number.isFinite(spotAfterScaled) ||
    spotAfterScaled <= 0
  ) {
    return { candles, volumes };
  }

  const lastIdx = candles.length - 1;
  const last = candles[lastIdx]!;
  const priorClose = lastIdx > 0 ? candles[lastIdx - 1]!.close : undefined;
  const close = spotAfterScaled;
  const open = coherentOpenForBar(last.open, close, priorClose);

  const patched = sanitizeCandleOhlc(
    {
      time: last.time,
      open,
      high: Math.max(last.high, open, close),
      low: Math.min(last.low, open, close),
      close,
    },
    close
  );

  const nextCandles = candles.slice();
  nextCandles[lastIdx] = patched;

  let nextVolumes = volumes;
  if (volumes.length > lastIdx) {
    const vol = volumes[lastIdx]!;
    nextVolumes = volumes.slice();
    nextVolumes[lastIdx] = {
      ...vol,
      color:
        side === "buy"
          ? "rgba(74, 222, 128, 0.5)"
          : "rgba(248, 113, 113, 0.5)",
    };
  }

  return { candles: nextCandles, volumes: nextVolumes };
}

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";

/** Pump.fun-style subscript for tiny prices: $0.0₄42 = $0.000042 */
export function formatPumpSubscriptPrice(value: number, prefix = "$"): string {
  if (!Number.isFinite(value) || value <= 0) return `${prefix}0`;
  if (value >= 1) return `${prefix}${value.toFixed(2)}`;
  if (value >= 0.01) return `${prefix}${value.toFixed(4)}`;

  const scientific = value.toExponential(12);
  const match = /^(\d)\.(\d+)e-(\d+)$/.exec(scientific);
  if (!match) return `${prefix}${value.toExponential(2)}`;

  const mantissa = (match[1] + match[2]).replace(/0+$/, "").slice(0, 4);
  const exp = Number(match[3]);
  const zeroCount = Math.max(0, exp - 1);
  const sub =
    zeroCount <= 9
      ? SUBSCRIPTS[zeroCount]!
      : String(zeroCount)
          .split("")
          .map((d) => SUBSCRIPTS[Number(d)]!)
          .join("");

  return `${prefix}0.0${sub}${mantissa}`;
}

export function formatChartPrice(value: number, currency: "bnb" | "usd" | "mcap"): string {
  if (currency === "usd" || currency === "mcap") {
    return formatPumpSubscriptPrice(value, "$");
  }
  if (value >= 0.001) return `${value.toFixed(6)} BNB`;
  return formatPumpSubscriptPrice(value, "").replace(/^\$/, "") + " BNB";
}

/** LWC custom price format — `base` (1/minMove) must be a power of 10 or tick math throws "unexpected base". */
export type ChartCustomPriceFormat = {
  type: "custom";
  formatter: (price: number) => string;
  base: number;
};

export type ChartBuiltinPriceFormat = {
  type: "price";
  precision: number;
};

export type ChartPriceFormat = ChartCustomPriceFormat | ChartBuiltinPriceFormat;

const CHART_PRICE_PRECISION_MIN = 4;
const CHART_PRICE_PRECISION_MAX = 12;
const CHART_PRICE_BASE_EXP_MAX = 18;

/** Power-of-10 base for LWC — arbitrary minMove values break 1/minMove tick math on log scale. */
export function resolveChartPriceBase(candles: CandleBar[]): number {
  let max = 0;
  for (const c of candles) {
    max = Math.max(max, c.high, c.close);
  }

  let precision = 8;
  if (max > 0 && Number.isFinite(max)) {
    const exp = Math.floor(Math.log10(max));
    precision = Math.max(CHART_PRICE_PRECISION_MIN, Math.min(CHART_PRICE_PRECISION_MAX, -exp + 2));

    // Match ensureVisibleCandleBodies span (~max × 1e-5) using a power-of-10 step only.
    const minVisibleStep = max * 1e-5;
    if (minVisibleStep > 0 && Number.isFinite(minVisibleStep)) {
      const stepPrecision = Math.min(
        CHART_PRICE_PRECISION_MAX,
        Math.max(0, -Math.floor(Math.log10(minVisibleStep)))
      );
      precision = Math.max(precision, stepPrecision);
    }
  }

  const baseExp = Math.max(0, Math.min(CHART_PRICE_BASE_EXP_MAX, precision));
  const base = Math.pow(10, baseExp);
  return Number.isFinite(base) && base > 0 ? base : 1e8;
}

export function chartPriceFormatFromBase(
  base: number,
  currency: "bnb" | "usd" | "mcap",
  bnbUsd?: number | null
): ChartCustomPriceFormat {
  const safeBase =
    Number.isFinite(base) && base > 0
      ? base
      : 1e8;
  const precision = Math.max(
    CHART_PRICE_PRECISION_MIN,
    Math.min(CHART_PRICE_PRECISION_MAX, Math.round(Math.log10(safeBase)))
  );
  const usdRate = bnbUsd != null && bnbUsd > 0 ? bnbUsd : 1;

  return {
    type: "custom",
    base: safeBase,
    formatter: (price: number) => {
      if (!Number.isFinite(price)) return "—";
      if (price === 0) return currency === "usd" || currency === "mcap" ? "$0" : "0";
      if (currency === "mcap") {
        const usd = price * usdRate;
        if (!Number.isFinite(usd) || usd <= 0) return "$0";
        if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
        if (usd >= 10_000) return `$${(usd / 1_000).toFixed(1)}K`;
        return `$${usd.toFixed(2)}`;
      }
      if (currency === "usd") {
        return formatPumpSubscriptPrice(price * usdRate, "$");
      }
      if (price >= 0.001) return price.toFixed(Math.min(6, precision));
      return formatPumpSubscriptPrice(price, "") + " BNB";
    },
  };
}

export function resolveChartPriceFormat(
  candles: CandleBar[],
  currency: "bnb" | "usd" | "mcap",
  bnbUsd?: number | null
): ChartCustomPriceFormat {
  return chartPriceFormatFromBase(resolveChartPriceBase(candles), currency, bnbUsd);
}

/** Built-in LWC price format fallback when custom base/minMove is rejected. */
export function chartBuiltinPriceFormatFallback(candles: CandleBar[]): ChartBuiltinPriceFormat {
  const base = resolveChartPriceBase(candles);
  const precision = Math.max(
    CHART_PRICE_PRECISION_MIN,
    Math.min(CHART_PRICE_PRECISION_MAX, Math.round(Math.log10(base)))
  );
  return { type: "price", precision };
}

type SeriesPriceFormatTarget = {
  applyOptions: (options: { priceFormat: ChartPriceFormat }) => void;
};

/** Apply series priceFormat without crashing the token page on invalid LWC tick math. */
export function applyCandleSeriesPriceFormat(
  series: SeriesPriceFormatTarget,
  priceFormat: ChartCustomPriceFormat,
  candles: CandleBar[]
): void {
  try {
    series.applyOptions({ priceFormat });
  } catch {
    series.applyOptions({ priceFormat: chartBuiltinPriceFormatFallback(candles) });
  }
}

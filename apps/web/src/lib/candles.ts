import { parseEther } from "viem";
import { NATIVE_SYMBOL } from "@/config/chain";
import { isSolanaChainFamily } from "@/config/chain-family";
import type { TradeItem } from "@/lib/db/launchpad";
import {
  DEFAULT_VIRTUAL_TOKEN_RESERVE,
  DEFAULT_VIRTUAL_ZUG_RESERVE,
  spotPriceZugFromReserves,
} from "@/lib/bonding-curve";

/** Fallback when WS/indexer trade rows omit fee_zug (chart spot replay). */
const CHART_FEE_ESTIMATE_BPS = 100n;
const FEE_BPS_DENOMINATOR = 10_000n;

export type CandleInterval = "5m" | "15m" | "1h" | "4h";

/** Default chart interval (SSR, API fallback, initial client state). */
export const DEFAULT_CHART_INTERVAL: CandleInterval = "5m";

export const CANDLE_INTERVALS: { id: CandleInterval; label: string; ms: number }[] = [
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

/**
 * Enterprise fallback when indexer omits `candleUpdates` on the trade WS fan-out.
 * Builds the same bucket shape so chart tip never waits on HTTP poll (ObsessionDB dual-path).
 */
export function synthesizeCandleUpdatesFromSpot(input: {
  spotAfter: number;
  spotBefore?: number;
  volumeNative: number;
  isBuy: boolean;
  blockTimeMs: number;
  /** Prior closes by interval — open continuity for new buckets. */
  priorCloseByInterval?: Partial<Record<CandleInterval, number>>;
}): CandleWsUpdate[] {
  const after = input.spotAfter;
  if (!(after > 0) || !Number.isFinite(after)) return [];
  const before =
    input.spotBefore != null && input.spotBefore > 0 && Number.isFinite(input.spotBefore)
      ? input.spotBefore
      : after;
  const volume = Math.max(0, input.volumeNative);
  const buyVolume = input.isBuy ? volume : 0;
  const out: CandleWsUpdate[] = [];

  for (const { id, ms } of CANDLE_INTERVALS) {
    const bucketSec = Math.floor(input.blockTimeMs / ms) * (ms / 1000);
    const prior = input.priorCloseByInterval?.[id];
    void prior;
    const open = before;
    const high = Math.max(open, before, after);
    const low = Math.min(open, before, after);
    out.push({
      interval: id,
      time: bucketSec,
      open: String(open),
      high: String(high),
      low: String(low),
      close: String(after),
      volume: String(volume),
      buyVolume: String(buyVolume),
      tradeCount: 1,
      isNewBucket: true,
    });
  }
  return out;
}

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

/** Latest bonding-curve spot (BNB/token) after replaying trades chronologically. */
export function resolveLatestSpotPriceBnb(trades: TradeItem[]): number | null {
  if (trades.length === 0) return null;

  const chronological = [...trades].sort(
    (a, b) => new Date(a.blockTime).getTime() - new Date(b.blockTime).getTime()
  );

  // Walk newest→oldest for an indexed bonding mark (WS / optimistic / DB).
  for (let i = chronological.length - 1; i >= 0; i--) {
    const indexedSpot = Number(chronological[i]!.spotPriceBnb);
    if (Number.isFinite(indexedSpot) && indexedSpot > 0) return indexedSpot;
  }

  // EVM-only fallback: replay with default virtuals. Solana callers must attach spotPriceBnb.
  if (!isSolanaChainFamily) {
    const last = chronological[chronological.length - 1]!;
    const ticks = buildTradeSpotTicks(chronological);
    const tick = ticks.get(last.id);
    if (tick && tick.after > 0) return tick.after;

    const exec = Number(last.priceBnb);
    return Number.isFinite(exec) && exec > 0 ? exec : null;
  }

  return null;
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
      const saneTouches = touchPrices.filter(
        (p) => p > 0 && isSpotMoveSane(p, closePrice)
      );
      const touches = saneTouches.length > 0 ? saneTouches : [closePrice];
      // First print opens the bucket — do not stitch prior close (needle bug).
      const open = spotOpen;
      buckets.set(bucketSec, {
        open,
        high: Math.max(open, ...touches),
        low: Math.min(open, ...touches),
        close: closePrice,
        volume: point.volumeBnb,
        buyVol: point.isBuy ? point.volumeBnb : 0,
      });
    } else {
      const saneTouches = touchPrices.filter(
        (p) => p > 0 && isSpotMoveSane(p, closePrice)
      );
      const touches = saneTouches.length > 0 ? saneTouches : [closePrice];
      existing.high = Math.max(existing.high, ...touches);
      existing.low = Math.min(existing.low, ...touches);
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
  // Only fill holes between trades — do not invent an empty live bucket (phantom wicks).
  const endSec = lastTradeSec;

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

/** Gap-fill flat candles between stored buckets (pump.fun style).
 * Only fills holes between the first and last *traded* bucket — never invents an
 * empty "live" candle ahead of the last trade (that created phantom wicks).
 */
export function fillGapsForStoredCandles(
  candles: CandleBar[],
  volumes: VolumeBar[],
  interval: CandleInterval,
  options: {
    endTimeMs?: number;
    maxGapBarsAfterLastTrade?: number;
    /** Live bonding mark — gap-fill forward close is validated against this. */
    anchorPrice?: number;
    /**
     * When true, also append flat bars from last trade through wall-clock live bucket.
     * Default false — empty live buckets must not appear as shadow-only candles.
     */
    extendToLive?: boolean;
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
  const endSec =
    options.extendToLive === true
      ? Math.max(lastTradeSec, liveEndSec)
      : lastTradeSec;

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
    // Carry forward last close between traded buckets only.
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

function intervalSecFor(interval: CandleInterval): number {
  return (CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 60_000) / 1000;
}

/** Flat carry-forward buckets when WS/indexer jumps ahead in time. */
function appendFlatBucketsThrough(
  candles: CandleBar[],
  volumes: VolumeBar[],
  fromExclusiveSec: number,
  toInclusiveSec: number,
  flatPrice: number,
  interval: CandleInterval
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  const step = intervalSecFor(interval);
  if (!Number.isFinite(flatPrice) || flatPrice <= 0) {
    return { candles, volumes };
  }
  const nextCandles = candles.slice();
  const nextVolumes = volumes.slice();
  for (let t = fromExclusiveSec + step; t < toInclusiveSec; t += step) {
    nextCandles.push({
      time: t,
      open: flatPrice,
      high: flatPrice,
      low: flatPrice,
      close: flatPrice,
    });
    nextVolumes.push({
      time: t,
      value: 0,
      color: volumeBarColor(0, 0),
    });
  }
  return { candles: nextCandles, volumes: nextVolumes };
}

/** Patch or append a live WS candle bucket without full setData rebuild. */
export function mergeWsCandleUpdate(
  candles: CandleBar[],
  volumes: VolumeBar[],
  update: CandleWsUpdate,
  priceScale = 1
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  const { candle: raw, volume } = wsCandleUpdateToBars(update, priceScale);
  if (!Number.isFinite(raw.close) || raw.close <= 0) {
    return { candles, volumes };
  }
  const interval = update.interval as CandleInterval;
  // Indexer tip is the only open SSOT — never fall back open→close.
  const candle = sanitizeTailCandleOhlc(raw, raw.close, { preserveOpen: true });

  if (candles.length === 0) {
    return { candles: [candle], volumes: [volume] };
  }

  const last = candles[candles.length - 1]!;
  if (update.isNewBucket && candle.time > last.time) {
    const priorClose = last.close;
    let nextCandles = candles.slice();
    let nextVolumes = volumes.slice();
    if (candle.time - last.time > intervalSecFor(interval)) {
      const padded = appendFlatBucketsThrough(
        nextCandles,
        nextVolumes,
        last.time,
        candle.time,
        priorClose,
        interval
      );
      nextCandles = padded.candles;
      nextVolumes = padded.volumes;
    }
    return {
      candles: [...nextCandles, candle],
      volumes: [...nextVolumes, volume],
    };
  }

  const idx = candles.findIndex((c) => c.time === candle.time);
  if (idx >= 0) {
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    // ONE SOURCE: WS tip replaces the open bucket entirely (including open).
    nextCandles[idx] = candle;
    if (idx < nextVolumes.length) nextVolumes[idx] = volume;
    else nextVolumes.push(volume);
    return { candles: nextCandles, volumes: nextVolumes };
  }

  if (candle.time === last.time) {
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    nextCandles[nextCandles.length - 1] = candle;
    if (nextVolumes.length > 0) nextVolumes[nextVolumes.length - 1] = volume;
    else nextVolumes.push(volume);
    return { candles: nextCandles, volumes: nextVolumes };
  }

  return { candles, volumes };
}

/**
 * Redis hot tip → history series. Replaces the matching bucket entirely (open-bucket SSOT).
 * Do not use mergeWsCandleUpdate here — that preserved CH open and created spectator needles.
 */
export function upsertHotCandleTail(
  candles: CandleBar[],
  volumes: VolumeBar[],
  hot: CandleWsUpdate,
  priceScale = 1
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  const { candle: raw, volume } = wsCandleUpdateToBars(hot, priceScale);
  if (!Number.isFinite(raw.close) || raw.close <= 0) {
    return { candles, volumes };
  }
  const candle = sanitizeTailCandleOhlc(raw, raw.close, { preserveOpen: true });
  const nextCandles = candles.slice();
  const nextVolumes = volumes.slice();
  const idx = nextCandles.findIndex((c) => c.time === candle.time);

  if (idx >= 0) {
    nextCandles[idx] = candle;
    if (idx < nextVolumes.length) nextVolumes[idx] = volume;
    else nextVolumes.push(volume);
    return {
      candles: nextCandles,
      volumes: nextVolumes,
    };
  }

  if (nextCandles.length === 0 || candle.time > nextCandles[nextCandles.length - 1]!.time) {
    nextCandles.push(candle);
    nextVolumes.push(volume);
    return {
      candles: nextCandles,
      volumes: nextVolumes,
    };
  }

  // Rare: hot bucket older than tip — insert in time order.
  let insertAt = nextCandles.findIndex((c) => c.time > candle.time);
  if (insertAt < 0) insertAt = nextCandles.length;
  nextCandles.splice(insertAt, 0, candle);
  nextVolumes.splice(insertAt, 0, volume);
  return {
    candles: nextCandles,
    volumes: nextVolumes,
  };
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

  // Bonding: open = first print (spotBefore), never prior-close stitch.
  void previousCloseHint;
  let open = before > 0 ? before : after;
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

  // Existing bucket → freeze its open; new bucket → first print (spotBefore).
  const openBase =
    idx >= 0
      ? candles[idx]!.open
      : before > 0
        ? before
        : after;

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
    // Existing bucket open is frozen (indexer/WS SSOT once present).
    const open = existing.open > 0 ? existing.open : openBase;
    const merged = sanitizeTailCandleOhlc(
      {
        time: bucketSec,
        open,
        high: Math.max(existing.high, patched.high, after, open),
        low: Math.min(existing.low, patched.low, after, open),
        close: after,
      },
      after,
      { preserveOpen: true }
    );
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    nextCandles[idx] = merged;
    nextVolumes[idx] = volBar;
    return { candles: nextCandles, volumes: nextVolumes };
  }

  if (!last || bucketSec > last.time) {
    let nextCandles = candles.slice();
    let nextVolumes = volumes.slice();
    if (last && bucketSec - last.time > intervalSecFor(interval)) {
      const padded = appendFlatBucketsThrough(
        nextCandles,
        nextVolumes,
        last.time,
        bucketSec,
        last.close,
        interval
      );
      nextCandles = padded.candles;
      nextVolumes = padded.volumes;
    }
    const open = patched.open > 0 ? patched.open : after;
    const opened = sanitizeTailCandleOhlc(
      {
        ...patched,
        open,
        high: Math.max(patched.high, open, patched.close),
        low: Math.min(patched.low, open, patched.close),
      },
      patched.close
    );
    return {
      candles: [...nextCandles, opened],
      volumes: [...nextVolumes, volBar],
    };
  }

  if (bucketSec === last.time) {
    const open = last.open > 0 ? last.open : openBase;
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    nextCandles[nextCandles.length - 1] = sanitizeTailCandleOhlc(
      {
        time: last.time,
        open,
        high: Math.max(last.high, patched.high, after, open),
        low: Math.min(last.low, patched.low, after, open),
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
/** Same cap as arena WS MCAP jump reject — blocks false needles from transient marks. */
const SPOT_JUMP_REJECT_RATIO = 4;

/** Whether two spot prices are on the same decade scale (guards stale 1000× DB OHLC). */
export function pricesSameMagnitude(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return true;
  return Math.abs(Math.log10(a / b)) <= OHLC_MAGNITUDE_LOG_EPS;
}

/** True when next spot is a plausible move from previous (not a garbage wick print). */
export function isSpotMoveSane(previous: number, next: number): boolean {
  if (!Number.isFinite(previous) || previous <= 0) return true;
  if (!Number.isFinite(next) || next <= 0) return false;
  if (pricesSameMagnitude(previous, next)) return true;
  const ratio = next / previous;
  return ratio <= SPOT_JUMP_REJECT_RATIO && ratio >= 1 / SPOT_JUMP_REJECT_RATIO;
}

const BAR_CONTINUITY_MATCH_RATIO = 1.01;

export function isBarContinuityMatch(priorClose: number, tradeOpen: number): boolean {
  if (!Number.isFinite(priorClose) || !Number.isFinite(tradeOpen)) return false;
  if (!(priorClose > 0) || !(tradeOpen > 0)) return false;
  const ratio = priorClose / tradeOpen;
  return (
    ratio <= BAR_CONTINUITY_MATCH_RATIO && ratio >= 1 / BAR_CONTINUITY_MATCH_RATIO
  );
}

/**
 * Historical display helper — DO NOT use on the live tip path.
 * Rewriting open on every paint made open jump between screenshots.
 * Live buckets: open is set once (first print) and must stay frozen.
 */
export function repairBondingNeedleOpens(candles: CandleBar[]): CandleBar[] {
  // Intentionally a no-op: mutating open client-side fought WS/hot SSOT and
  // produced three different opens for the same 5m tip across refreshes.
  return candles;
}

/**
 * @deprecated Client must not freeze a local open over indexer WS open.
 * Kept as identity so call sites compile — open SSOT is the series tip from WS/hot.
 */
export function lockTipOpenAgainstRegression(
  next: CandleBar[],
  _painted: CandleBar[]
): CandleBar[] {
  return next;
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
  // Buy-only buckets often have open ~4–6× below close (same decade). Do not 10×-rescale that.
  if (Math.abs(logRatio) < 0.85) {
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
    Number.isFinite(p) && p > 0 && isSpotMoveSane(anchor, p) ? p : fallback;

  const close = pick(bar.close, anchor);
  const open = pick(bar.open, close);
  const high = Math.max(pick(bar.high, close), open, close);
  const low = Math.min(pick(bar.low, close), open, close);
  return { time: bar.time, open, high, low, close };
}

/**
 * Live-tail sanitize — fixes decade-scale garbage only; keeps real intra-bucket trade wicks.
 * When preserveOpen=true (WS/hot tip), never replace open with close.
 */
export function sanitizeTailCandleOhlc(
  bar: CandleBar,
  anchor: number,
  opts?: { preserveOpen?: boolean }
): CandleBar {
  if (!Number.isFinite(anchor) || anchor <= 0) return bar;

  const pickMag = (p: number, fallback: number): number => {
    if (!Number.isFinite(p) || p <= 0) return fallback;
    if (pricesSameMagnitude(p, anchor)) return p;
    const rescaled = rescalePriceToAnchor(p, anchor);
    return pricesSameMagnitude(rescaled, anchor) ? rescaled : fallback;
  };

  const close = pickMag(bar.close, anchor);
  let open: number;
  if (opts?.preserveOpen && Number.isFinite(bar.open) && bar.open > 0) {
    // Decade-rescale only — never invent open from close.
    open = pricesSameMagnitude(bar.open, anchor)
      ? bar.open
      : (() => {
          const rescaled = rescalePriceToAnchor(bar.open, anchor);
          return pricesSameMagnitude(rescaled, anchor) ? rescaled : bar.open;
        })();
  } else {
    open = pickMag(bar.open, close);
  }
  const high = Math.max(pickMag(bar.high, close), open, close);
  const low = Math.min(pickMag(bar.low, close), open, close);
  return { time: bar.time, open, high, low, close };
}

export function sanitizeCandleSeries(candles: CandleBar[], anchor: number): CandleBar[] {
  if (candles.length === 0 || !Number.isFinite(anchor) || anchor <= 0) return candles;
  return candles.map((c) => sanitizeCandleOhlc(c, anchor));
}

/** Sanitize only the live tail — magnitude drift only; never invent open from close. */
export function sanitizeTailCandleSeries(candles: CandleBar[], anchor: number): CandleBar[] {
  if (candles.length === 0 || !Number.isFinite(anchor) || anchor <= 0) return candles;
  const next = candles.slice();
  next[next.length - 1] = sanitizeTailCandleOhlc(next[next.length - 1]!, anchor, {
    preserveOpen: true,
  });
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

/**
 * Pin live bucket close to bonding spot (same source as header MCAP/price).
 * High/low expand to include the pinned close; open stays from trade history.
 */
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
  // Live mark only moves close/high/low — never rewrite a traded bucket's open.
  const open =
    bucketVolume > 0
      ? existing.open > 0
        ? existing.open
        : close
      : coherentOpenForBar(existing.open, close, priorClose);

  // Live mark moves close/high/low — never rewrite a traded bucket's open.
  const high = Math.max(existing.high, open, close);
  const low = Math.min(existing.low, open, close);

  const nextCandles = candles.slice();
  nextCandles[targetIdx] = sanitizeTailCandleOhlc(
    {
      time: existing.time,
      open,
      high,
      low,
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
  const close = spotAfterScaled;
  const open = last.open > 0 ? last.open : close;

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

export type PumpSubscriptPriceParts =
  | { kind: "plain"; text: string }
  | { kind: "subscript"; prefix: string; zeroCount: number; mantissa: string };

/** Pump.fun-style subscript parts: $0.0₅79 = $0.000000079 (max 2 sig digits after sub). */
export function parsePumpSubscriptPriceParts(
  value: number,
  prefix = "$"
): PumpSubscriptPriceParts {
  if (!Number.isFinite(value) || value <= 0) return { kind: "plain", text: `${prefix}0` };
  if (value >= 1) return { kind: "plain", text: `${prefix}${value.toFixed(2)}` };
  if (value >= 0.01) return { kind: "plain", text: `${prefix}${value.toFixed(4)}` };

  const scientific = value.toExponential(12);
  const match = /^(\d)\.(\d+)e-(\d+)$/.exec(scientific);
  if (!match) return { kind: "plain", text: `${prefix}${value.toExponential(2)}` };

  const mantissa = (match[1] + match[2]).replace(/0+$/, "").slice(0, 2);
  const exp = Number(match[3]);
  const zeroCount = Math.max(0, exp - 1);

  return { kind: "subscript", prefix, zeroCount, mantissa };
}

const UNICODE_SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toUnicodeSubscriptDigits(n: number): string {
  return String(n)
    .split("")
    .map((digit) => UNICODE_SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
    .join("");
}

/** Canvas / plain-string pump price — $0.0₅79 (Unicode sub, no parentheses). */
export function formatPumpSubscriptPriceAxis(value: number, prefix = "$"): string {
  const parts = parsePumpSubscriptPriceParts(value, prefix);
  if (parts.kind === "plain") return parts.text;
  return `${parts.prefix}0.0${toUnicodeSubscriptDigits(parts.zeroCount)}${parts.mantissa}`;
}

/** Full decimal for tooltips and document.title. */
export function formatPumpSubscriptPriceFull(value: number, prefix = "$"): string {
  if (!Number.isFinite(value) || value <= 0) return `${prefix}0`;
  if (value >= 1) return `${prefix}${value.toFixed(2)}`;
  if (value >= 0.01) return `${prefix}${value.toFixed(4)}`;
  const decimals =
    value >= 0.001 ? 6 :
    value >= 0.0001 ? 7 :
    value >= 0.00001 ? 8 :
    value >= 0.000001 ? 9 : 12;
  return `${prefix}${value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")}`;
}

/** String form for compact labels — same as axis (Unicode sub). */
export function formatPumpSubscriptPrice(value: number, prefix = "$"): string {
  return formatPumpSubscriptPriceAxis(value, prefix);
}

export function formatChartPrice(value: number, currency: "bnb" | "usd" | "mcap"): string {
  if (currency === "usd" || currency === "mcap") {
    return formatPumpSubscriptPrice(value, "$");
  }
  if (value >= 0.001) return `${value.toFixed(6)} ${NATIVE_SYMBOL}`;
  return formatPumpSubscriptPrice(value, "").replace(/^\$/, "") + ` ${NATIVE_SYMBOL}`;
}

/** LWC custom price format — `base` (1/minMove) must be a power of 10 or tick math throws "unexpected base". */
export type ChartCustomPriceFormat = {
  type: "custom";
  formatter: (price: number) => string;
  base: number;
  tickmarksFormatter?: (prices: number[]) => string[];
};

type ChartLogFormula = {
  logicalOffset: number;
  coordOffset: number;
};

function candleNativeRange(candles: CandleBar[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const candle of candles) {
    if (candle.low > 0) min = Math.min(min, candle.low);
    max = Math.max(max, candle.high, candle.close);
  }
  if (!Number.isFinite(min) || min <= 0 || max <= 0) return null;
  return { min, max };
}

/** Mirror LWC logFormulaForPriceRange for axis label conversion. */
function chartLogFormulaForRange(min: number, max: number): ChartLogFormula {
  const diff = Math.abs(max - min);
  if (diff >= 1 || diff < 1e-15) {
    return { logicalOffset: 0, coordOffset: 0 };
  }
  const digits = Math.ceil(Math.abs(Math.log10(diff)));
  return {
    logicalOffset: digits,
    coordOffset: 1 / Math.pow(10, digits),
  };
}

function chartToLog(price: number, formula: ChartLogFormula): number {
  const magnitude = Math.abs(price);
  if (magnitude < 1e-15) return 0;
  return Math.log10(magnitude + formula.coordOffset) + formula.logicalOffset;
}

function chartFromLog(logical: number, formula: ChartLogFormula): number {
  const magnitude = Math.abs(logical);
  if (magnitude < 1e-15) return 0;
  return Math.pow(10, magnitude - formula.logicalOffset) - formula.coordOffset;
}

/**
 * LWC log-scale axis passes logical coordinates to priceFormatter for tick marks,
 * but actual prices for the last-value label. Convert logical ticks back to native price.
 */
function wrapChartFormatterForLogScale(
  formatter: (price: number) => string,
  candles: CandleBar[]
): ChartCustomPriceFormat["formatter"] {
  const range = candleNativeRange(candles);
  if (!range) return formatter;

  const formula = chartLogFormulaForRange(range.min, range.max);
  const logMin = chartToLog(range.min, formula);
  const logMax = chartToLog(range.max, formula);
  const logLo = Math.min(logMin, logMax) - 1e-6;
  const logHi = Math.max(logMin, logMax) + 1e-6;

  return (value: number) => {
    if (!Number.isFinite(value)) return formatter(value);
    if (value >= range.min && value <= range.max) {
      return formatter(value);
    }
    if (value >= logLo && value <= logHi) {
      return formatter(chartFromLog(value, formula));
    }
    // Log scale can still be active briefly on MCAP first paint — ticks arrive as
    // magnitude-shifted logical coords (often ~1000× native). Walk down by 10 until in range.
    if (value > range.max * 2 || value < range.min * 0.5) {
      let adjusted = value;
      for (let attempt = 0; attempt < 8 && adjusted > range.max * 1.5; attempt += 1) {
        adjusted /= 10;
      }
      if (adjusted >= range.min * 0.25 && adjusted <= range.max * 2) {
        return formatter(adjusted);
      }
    }
    return formatter(value);
  };
}

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
  bnbUsd?: number | null,
  options?: { candles?: CandleBar[]; useLogScale?: boolean }
): ChartCustomPriceFormat {
  const safeBase =
    Number.isFinite(base) && base > 0
      ? base
      : 1e8;
  const precision = Math.max(
    CHART_PRICE_PRECISION_MIN,
    Math.min(CHART_PRICE_PRECISION_MAX, Math.round(Math.log10(safeBase)))
  );
  const usdRate = bnbUsd != null && bnbUsd > 0 ? bnbUsd : null;

  const formatNative = (price: number) => {
    if (!Number.isFinite(price)) return "—";
    if (price === 0) return currency === "usd" || currency === "mcap" ? "$0" : "0";
    if (currency === "mcap") {
      if (usdRate == null) return "—";
      // Series stores native MCAP (spot × supply). Do NOT decade-shift labels —
      // that falsely printed ~$223 while true MCAP was ~$2.2K during live pins.
      const usd = price * usdRate;
      if (!Number.isFinite(usd) || usd <= 0) return "$0";
      if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
      if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
      if (usd >= 10_000) return `$${(usd / 1_000).toFixed(2)}K`;
      return `$${usd.toFixed(2)}`;
    }
    if (currency === "usd") {
      if (usdRate == null) return "—";
      return formatPumpSubscriptPriceAxis(price * usdRate, "$");
    }
    if (price >= 0.001) return price.toFixed(Math.min(6, precision));
    return formatPumpSubscriptPriceAxis(price, "") + ` ${NATIVE_SYMBOL}`;
  };

  // Log-scale ticks need logical→price unwrap. MCAP is always linear — never wrap
  // (wrapping stale log coords produced $xxM ghost axis while last value looked correct).
  const formatter =
    options?.useLogScale && options?.candles?.length
      ? wrapChartFormatterForLogScale(formatNative, options.candles)
      : formatNative;

  return {
    type: "custom",
    base: safeBase,
    formatter,
    tickmarksFormatter: (prices) => prices.map((price) => formatter(price)),
  };
}

export function resolveChartPriceFormat(
  candles: CandleBar[],
  currency: "bnb" | "usd" | "mcap",
  bnbUsd?: number | null,
  useLogScale = false
): ChartCustomPriceFormat {
  return chartPriceFormatFromBase(resolveChartPriceBase(candles), currency, bnbUsd, {
    candles,
    useLogScale,
  });
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

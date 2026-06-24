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

    const after = spotPriceZugFromReserves(
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
  const gapTail =
    options.maxGapBarsAfterLastTrade ?? gapTailBarsForInterval(interval);
  const tailEndSec = lastTradeSec + gapTail * intervalSec;
  const liveEndSec = Math.floor(endBucketMs / 1000);
  const endSec = Math.max(lastTradeSec, Math.min(liveEndSec, tailEndSec));

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
  } = {}
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (candles.length === 0) return { candles, volumes };

  const intervalMs = CANDLE_INTERVALS.find((i) => i.id === interval)?.ms ?? 5 * 60_000;
  const intervalSec = intervalMs / 1000;
  const endTimeMs = options.endTimeMs ?? Date.now();
  const gapTail = options.maxGapBarsAfterLastTrade ?? gapTailBarsForInterval(interval);

  const volumeByTime = new Map(volumes.map((v) => [v.time, v]));
  const sortedTimes = candles.map((c) => c.time).sort((a, b) => a - b);
  const lastTradeSec = sortedTimes[sortedTimes.length - 1]!;
  const endBucketMs = Math.floor(endTimeMs / intervalMs) * intervalMs;
  const tailEndSec = lastTradeSec + gapTail * intervalSec;
  const liveEndSec = Math.floor(endBucketMs / 1000);
  const endSec = Math.max(lastTradeSec, Math.min(liveEndSec, tailEndSec));

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
      lastClose = bucketByTime.get(t)!.close;
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

/**
 * Upsert the actor's in-flight trade into the active interval bucket.
 * Works with DB-backed candles — does not require trade replay.
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

  let open = before > 0 ? before : after;
  if (idx >= 0) {
    open = candles[idx]!.open;
  } else if (last) {
    open = last.close;
  }
  if (actor.side === "buy" && after < open) open = after;
  if (actor.side === "sell" && after > open) open = after;

  const touch = [open, before > 0 ? before : open, after];
  const high = Math.max(...touch);
  const low = Math.min(...touch);
  const patched: CandleBar = { time: bucketSec, open, high, low, close: after };

  const prevVol = idx >= 0 ? (volumes[idx]?.value ?? 0) : 0;
  const nextVol = prevVol + tradeVol;
  const volBar: VolumeBar = {
    time: bucketSec,
    value: nextVol,
    color: volumeBarColor(nextVol, actor.side === "buy" ? nextVol : 0),
  };

  if (idx >= 0) {
    const existing = candles[idx]!;
    const merged: CandleBar = {
      time: bucketSec,
      open: existing.open,
      high: Math.max(existing.high, high),
      low: Math.min(existing.low, low),
      close: after,
    };
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
    const nextCandles = candles.slice();
    const nextVolumes = volumes.slice();
    nextCandles[nextCandles.length - 1] = {
      ...patched,
      open: last.open,
      high: Math.max(last.high, high),
      low: Math.min(last.low, low),
    };
    nextVolumes[nextVolumes.length - 1] = volBar;
    return { candles: nextCandles, volumes: nextVolumes };
  }

  return { candles, volumes };
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
  let open = last.open;
  const close = spotAfterScaled;

  if (side === "buy") {
    if (close < open) open = close;
  } else if (close > open) {
    open = close;
  }

  const patched: CandleBar = {
    time: last.time,
    open,
    high: Math.max(last.high, open, close),
    low: Math.min(last.low, open, close),
    close,
  };

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

export function resolveChartPriceFormat(
  candles: CandleBar[],
  currency: "bnb" | "usd" | "mcap",
  bnbUsd?: number | null
): {
  type: "custom";
  formatter: (price: number) => string;
  minMove: number;
} {
  let max = 0;
  for (const c of candles) {
    max = Math.max(max, c.high, c.close);
  }

  let precision = 8;
  if (max > 0) {
    const exp = Math.floor(Math.log10(max));
    precision = Math.max(4, Math.min(12, -exp + 2));
  }

  const minMove = Math.pow(10, -precision);
  const usdRate = bnbUsd != null && bnbUsd > 0 ? bnbUsd : 1;

  return {
    type: "custom",
    minMove,
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

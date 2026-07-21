import { cacheLife, cacheTag } from "next/cache";
import type { TokenDetail, TokenHolderSnapshot, TradeItem } from "@/lib/db/launchpad";
import { ACTIVITY_PAGE_SIZE } from "@/lib/activity-page-size";
import {
  getTokenByAddress,
  isGapFillCandlesSqlAvailable,
  listTokenCandlesFromDb,
  listTokenCandlesGapFilledFromDb,
  listTokenHolders,
} from "@/lib/db/launchpad";
import { listTapeTradesForToken } from "@/lib/tape-trades";
import { normalizeAddressParam } from "@/lib/address";
import {
  readTokenSnapshotCache,
  writeTokenSnapshotCache,
} from "@/lib/redis/token-cache";
import { useRedisArenaCache } from "@/lib/db/perf-flags";
import {
  fillGapsForStoredCandles,
  mergeWsCandleUpdate,
  storedCandlesToBars,
  DEFAULT_CHART_INTERVAL,
  type CandleBar,
  type CandleInterval,
  type CandleWsUpdate,
  type VolumeBar,
} from "@/lib/candles";
import { listTokenCandlesFromClickHouse } from "@/lib/clickhouse/candles";
import { readHotCandleUpdate } from "@/lib/redis/hot-cache";
import { buildTokenMarketSnapshot, type TokenMarketSnapshot } from "@/lib/token-market-snapshot";

export type TokenDetailPayload = {
  token: TokenDetail;
  trades: TradeItem[];
};

export type InitialChartCandles = {
  interval: CandleInterval;
  candles: CandleBar[];
  volumes: VolumeBar[];
  source: "db" | "trades";
  gapFilledByApi: boolean;
};

export type TokenDetailBundle = TokenDetailPayload & {
  holders: TokenHolderSnapshot[];
  /** Canonical spot + FDV — same math as header/chart/sidebar active row. */
  market: TokenMarketSnapshot;
  /** SSR chart seed (default 1m) — avoids empty first paint. */
  initialCandles?: InitialChartCandles;
};

const SSR_CHART_INTERVAL: CandleInterval = DEFAULT_CHART_INTERVAL;
const SSR_CHART_LIMIT = 1000;

function mergeHotTailBars(
  candles: CandleBar[],
  volumes: VolumeBar[],
  hot: CandleWsUpdate | null
): { candles: CandleBar[]; volumes: VolumeBar[] } {
  if (!hot) return { candles, volumes };
  return mergeWsCandleUpdate(candles, volumes, hot, 1);
}

async function fetchInitialChartCandles(
  normalized: string
): Promise<InitialChartCandles | undefined> {
  const hotTail = await readHotCandleUpdate(normalized, SSR_CHART_INTERVAL);

  const fromCh = await listTokenCandlesFromClickHouse(
    normalized,
    SSR_CHART_INTERVAL,
    SSR_CHART_LIMIT
  );
  if (fromCh && fromCh.rows.length > 0) {
    let raw = storedCandlesToBars(fromCh.rows);
    raw = mergeHotTailBars(raw.candles, raw.volumes, hotTail);
    const filled = fillGapsForStoredCandles(raw.candles, raw.volumes, SSR_CHART_INTERVAL, {
      endTimeMs: Date.now(),
      extendToLive: false,
    });
    if (filled.candles.length > 0) {
      return {
        interval: SSR_CHART_INTERVAL,
        candles: filled.candles,
        volumes: filled.volumes,
        source: "db",
        gapFilledByApi: true,
      };
    }
  }

  const stored = await listTokenCandlesFromDb(normalized, SSR_CHART_INTERVAL, SSR_CHART_LIMIT);
  if (stored.length === 0) {
    if (hotTail) {
      const seeded = mergeHotTailBars([], [], hotTail);
      if (seeded.candles.length > 0) {
        return {
          interval: SSR_CHART_INTERVAL,
          candles: seeded.candles,
          volumes: seeded.volumes,
          source: "db",
          gapFilledByApi: true,
        };
      }
    }
    return undefined;
  }

  if (await isGapFillCandlesSqlAvailable()) {
    try {
      const gapFilled = await listTokenCandlesGapFilledFromDb(
        normalized,
        SSR_CHART_INTERVAL,
        SSR_CHART_LIMIT
      );
      if (gapFilled.length > 0) {
        let bars = storedCandlesToBars(gapFilled);
        bars = mergeHotTailBars(bars.candles, bars.volumes, hotTail);
        const filled = fillGapsForStoredCandles(
          bars.candles,
          bars.volumes,
          SSR_CHART_INTERVAL,
          { endTimeMs: Date.now(), extendToLive: false }
        );
        return {
          interval: SSR_CHART_INTERVAL,
          candles: filled.candles,
          volumes: filled.volumes,
          source: "db",
          gapFilledByApi: true,
        };
      }
    } catch {
      // fall through to TS gap-fill
    }
  }

  let raw = storedCandlesToBars(stored);
  raw = mergeHotTailBars(raw.candles, raw.volumes, hotTail);
  const filled = fillGapsForStoredCandles(raw.candles, raw.volumes, SSR_CHART_INTERVAL, {
    endTimeMs: Date.now(),
    extendToLive: false,
  });
  return {
    interval: SSR_CHART_INTERVAL,
    candles: filled.candles,
    volumes: filled.volumes,
    source: "db",
    gapFilledByApi: true,
  };
}

async function fetchTokenDetailBundleCached(
  normalized: string
): Promise<TokenDetailBundle | null> {
  "use cache";
  cacheTag(`token:${normalized}`);
  cacheLife({ stale: 5, revalidate: 5, expire: 30 });

  if (useRedisArenaCache()) {
    const cached = await readTokenSnapshotCache(normalized);
    if (cached) {
      return {
        token: cached.token,
        trades: cached.trades,
        holders: cached.holders ?? [],
        market: cached.market ?? buildTokenMarketSnapshot(cached.token),
        initialCandles: cached.initialCandles,
      };
    }
  }

  const [token, tapeResult, holders, initialCandles] = await Promise.all([
    getTokenByAddress(normalized),
    listTapeTradesForToken(normalized, ACTIVITY_PAGE_SIZE, 0),
    listTokenHolders(normalized, ACTIVITY_PAGE_SIZE, 0),
    fetchInitialChartCandles(normalized),
  ]);

  if (!token) return null;

  const market = buildTokenMarketSnapshot(token);
  const bundle: TokenDetailBundle = {
    token,
    trades: tapeResult.trades,
    holders,
    market,
    initialCandles,
  };

  if (useRedisArenaCache()) {
    await writeTokenSnapshotCache(normalized, bundle);
  }

  return bundle;
}

/** Server-side token page bundle — SSR + shared with /api/tokens/[address]. */
export async function fetchTokenDetailBundle(
  addressParam: string
): Promise<TokenDetailBundle | null> {
  const normalized = normalizeAddressParam(addressParam);
  if (!normalized) return null;
  return fetchTokenDetailBundleCached(normalized);
}

/** Legacy payload without holders — delegates to bundle. */
export async function fetchTokenDetailPayload(
  addressParam: string
): Promise<TokenDetailPayload | null> {
  const bundle = await fetchTokenDetailBundle(addressParam);
  if (!bundle) return null;
  return { token: bundle.token, trades: bundle.trades };
}

import { cacheLife, cacheTag } from "next/cache";
import type { TokenDetail, TokenHolderSnapshot, TradeItem } from "@/lib/db/launchpad";
import { ACTIVITY_PAGE_SIZE } from "@/lib/activity-page-size";
import {
  getTokenByAddress,
  isGapFillCandlesSqlAvailable,
  listTokenCandlesFromDb,
  listTokenCandlesGapFilledFromDb,
  listTokenHolders,
  listTradesForToken,
} from "@/lib/db/launchpad";
import { normalizeAddressParam } from "@/lib/address";
import {
  readTokenSnapshotCache,
  writeTokenSnapshotCache,
} from "@/lib/redis/token-cache";
import { useRedisArenaCache } from "@/lib/db/perf-flags";
import {
  fillGapsForStoredCandles,
  storedCandlesToBars,
  type CandleBar,
  type CandleInterval,
  type VolumeBar,
} from "@/lib/candles";

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
  /** SSR chart seed (default 1m) — avoids empty first paint. */
  initialCandles?: InitialChartCandles;
};

const SSR_CHART_INTERVAL: CandleInterval = "1m";
const SSR_CHART_LIMIT = 1000;

async function fetchInitialChartCandles(
  normalized: string
): Promise<InitialChartCandles | undefined> {
  const stored = await listTokenCandlesFromDb(normalized, SSR_CHART_INTERVAL, SSR_CHART_LIMIT);
  if (stored.length === 0) return undefined;

  if (await isGapFillCandlesSqlAvailable()) {
    try {
      const gapFilled = await listTokenCandlesGapFilledFromDb(
        normalized,
        SSR_CHART_INTERVAL,
        SSR_CHART_LIMIT
      );
      if (gapFilled.length > 0) {
        const bars = storedCandlesToBars(gapFilled);
        return {
          interval: SSR_CHART_INTERVAL,
          candles: bars.candles,
          volumes: bars.volumes,
          source: "db",
          gapFilledByApi: true,
        };
      }
    } catch {
      // fall through to TS gap-fill
    }
  }

  const raw = storedCandlesToBars(stored);
  const filled = fillGapsForStoredCandles(raw.candles, raw.volumes, SSR_CHART_INTERVAL);
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
        initialCandles: cached.initialCandles,
      };
    }
  }

  const [token, trades, holders, initialCandles] = await Promise.all([
    getTokenByAddress(normalized),
    listTradesForToken(normalized, ACTIVITY_PAGE_SIZE, 0),
    listTokenHolders(normalized, ACTIVITY_PAGE_SIZE, 0),
    fetchInitialChartCandles(normalized),
  ]);

  if (!token) return null;

  const bundle: TokenDetailBundle = { token, trades, holders, initialCandles };

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

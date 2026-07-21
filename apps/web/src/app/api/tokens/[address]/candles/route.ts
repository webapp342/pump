import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildCandlesFromTrades,
  CANDLE_INTERVALS,
  DEFAULT_CHART_INTERVAL,
  fillGapsForStoredCandles,
  mergeWsCandleUpdate,
  seriesHasTemporalGaps,
  storedCandlesToBars,
  type CandleInterval,
  type CandleWsUpdate,
} from "@/lib/candles";
import { listTokenCandlesFromClickHouse } from "@/lib/clickhouse/candles";
import {
  getTokenByAddress,
  isGapFillCandlesSqlAvailable,
  listTokenCandlesFromDb,
  listTokenCandlesGapFilledFromDb,
  listTradesForChart,
} from "@/lib/db/launchpad";
import { readCandleCache, writeCandleCache } from "@/lib/redis/candle-cache";
import { readHotCandleUpdate } from "@/lib/redis/hot-cache";
import { logChartOlapSource, type ChartOlapSource } from "@/lib/chart-observability";

type RouteContext = { params: Promise<{ address: string }> };

const VALID_INTERVALS = new Set(CANDLE_INTERVALS.map((i) => i.id));
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 4000;

function mergeHotTail(
  candles: ReturnType<typeof storedCandlesToBars>,
  hot: CandleWsUpdate | null
): ReturnType<typeof storedCandlesToBars> {
  if (!hot) return candles;
  const merged = mergeWsCandleUpdate(candles.candles, candles.volumes, hot, 1);
  return { candles: merged.candles, volumes: merged.volumes };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { address } = await context.params;
  const intervalParam = request.nextUrl.searchParams.get("interval") ?? DEFAULT_CHART_INTERVAL;
  const interval = (VALID_INTERVALS.has(intervalParam as CandleInterval)
    ? intervalParam
    : DEFAULT_CHART_INTERVAL) as CandleInterval;
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitParam)))
    : DEFAULT_LIMIT;

  try {
    const token = await getTokenByAddress(address);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const cached = await readCandleCache(address, interval);
    if (cached && Date.now() - cached.cachedAt < 5_000) {
      logChartOlapSource({
        tokenAddress: address,
        interval,
        olap: "cache",
        bucketCount: cached.candles.length,
        cached: true,
      });
      return NextResponse.json(
        {
          data: {
            candles: cached.candles,
            volumes: cached.volumes,
            interval: cached.interval,
            source: cached.source,
            gapFilled: cached.gapFilled,
            gapFill: cached.gapFill,
            cached: true,
            frozen: false,
            status: token.status,
          },
        },
        {
          headers: {
            "Cache-Control": "private, max-age=2, stale-while-revalidate=5",
          },
        }
      );
    }

    const hotTail = await readHotCandleUpdate(address, interval);

    const fromCh = await listTokenCandlesFromClickHouse(address, interval, limit);
    if (fromCh && fromCh.rows.length > 0) {
      let raw = storedCandlesToBars(fromCh.rows);
      raw = mergeHotTail(raw, hotTail);
      const { candles, volumes } = fillGapsForStoredCandles(
        raw.candles,
        raw.volumes,
        interval,
        { endTimeMs: Date.now() }
      );
      if (candles.length > 0) {
        const payload = {
          candles,
          volumes,
          interval,
          source: "db" as const,
          gapFilled: true,
          gapFill: "ts" as const,
          bucketCount: fromCh.rows.length,
          frozen: false,
          status: token.status,
          olap: fromCh.source,
        };
        void writeCandleCache(address, interval, {
          candles,
          volumes,
          interval,
          source: "db",
          gapFilled: true,
          gapFill: "ts",
        });
        logChartOlapSource({
          tokenAddress: address,
          interval,
          olap: fromCh.source as ChartOlapSource,
          bucketCount: fromCh.rows.length,
        });
        return NextResponse.json(
          { data: payload },
          {
            headers: {
              "Cache-Control": "private, max-age=2, stale-while-revalidate=5",
            },
          }
        );
      }
    }

    const stored = await listTokenCandlesFromDb(address, interval, limit);
    if (stored.length > 0) {
      let gapFill: "sql" | "ts" = "ts";
      let raw: ReturnType<typeof storedCandlesToBars>;

      if (await isGapFillCandlesSqlAvailable()) {
        try {
          const gapFilled = await listTokenCandlesGapFilledFromDb(address, interval, limit);
          if (gapFilled.length > 0) {
            raw = storedCandlesToBars(gapFilled);
            gapFill = "sql";
          } else {
            raw = storedCandlesToBars(stored);
          }
        } catch {
          raw = storedCandlesToBars(stored);
        }
      } else {
        raw = storedCandlesToBars(stored);
      }

      raw = mergeHotTail(raw, hotTail);

      const { candles, volumes } = fillGapsForStoredCandles(
        raw.candles,
        raw.volumes,
        interval,
        { endTimeMs: Date.now() }
      );
      if (candles.length > 0) {
        if (gapFill === "sql" && seriesHasTemporalGaps(candles, interval)) {
          gapFill = "ts";
        }

        const payload = {
          candles,
          volumes,
          interval,
          source: "db" as const,
          gapFilled: true,
          gapFill,
          bucketCount: stored.length,
          frozen: false,
          status: token.status,
          olap: "postgres" as const,
        };

        void writeCandleCache(address, interval, {
          candles,
          volumes,
          interval,
          source: "db",
          gapFilled: true,
          gapFill,
        });

        logChartOlapSource({
          tokenAddress: address,
          interval,
          olap: "postgres",
          bucketCount: stored.length,
        });

        return NextResponse.json(
          { data: payload },
          {
            headers: {
              "Cache-Control": "private, max-age=2, stale-while-revalidate=5",
            },
          }
        );
      }
    }

    const trades = await listTradesForChart(address);
    const { candles, volumes } = buildCandlesFromTrades(trades, interval, 1, {
      fillGaps: true,
    });

    logChartOlapSource({
      tokenAddress: address,
      interval,
      olap: "trades_replay",
      bucketCount: candles.length,
    });

    return NextResponse.json(
      {
        data: {
          candles,
          volumes,
          interval,
          source: "trades" as const,
          gapFilled: true,
          gapFill: "ts" as const,
          tradeCount: trades.length,
          frozen: false,
          status: token.status,
          olap: "trades_replay" as const,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-cache",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildCandlesFromTrades,
  CANDLE_INTERVALS,
  fillGapsForStoredCandles,
  storedCandlesToBars,
  type CandleInterval,
} from "@/lib/candles";
import {
  getTokenByAddress,
  isGapFillCandlesSqlAvailable,
  listTokenCandlesFromDb,
  listTokenCandlesGapFilledFromDb,
  listTradesForChart,
} from "@/lib/db/launchpad";

type RouteContext = { params: Promise<{ address: string }> };

const VALID_INTERVALS = new Set(CANDLE_INTERVALS.map((i) => i.id));
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 4000;

export async function GET(request: NextRequest, context: RouteContext) {
  const { address } = await context.params;
  const intervalParam = request.nextUrl.searchParams.get("interval") ?? "1m";
  const interval = (VALID_INTERVALS.has(intervalParam as CandleInterval)
    ? intervalParam
    : "1m") as CandleInterval;
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitParam)))
    : DEFAULT_LIMIT;

  try {
    const token = await getTokenByAddress(address);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
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

      const { candles, volumes } =
        gapFill === "sql"
          ? raw
          : fillGapsForStoredCandles(raw.candles, raw.volumes, interval);

      return NextResponse.json(
        {
          data: {
            candles,
            volumes,
            interval,
            source: "db" as const,
            gapFilled: true,
            gapFill,
            bucketCount: stored.length,
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

    const trades = await listTradesForChart(address);
    const { candles, volumes } = buildCandlesFromTrades(trades, interval, 1, {
      fillGaps: true,
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

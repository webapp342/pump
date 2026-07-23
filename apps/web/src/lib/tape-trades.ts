import type { TradeItem } from "@/lib/db/launchpad";
import { listTradesForToken } from "@/lib/db/launchpad";
import { listTradesFromClickHouse } from "@/lib/clickhouse/trades";
import { txHashKey } from "@/lib/address";
import {
  readHotTapeEntries,
  type HotTapeEntry,
} from "@/lib/redis/hot-cache";
import { redisUrl } from "@/lib/db/perf-flags";

export type TapeTradesSource = "redis_hot" | "clickhouse" | "postgres" | "merged";

export type TapeTradesResult = {
  trades: TradeItem[];
  source: TapeTradesSource;
};

function hotTapeToTradeItem(entry: HotTapeEntry): TradeItem {
  const gross = Number(entry.zugAmount);
  const fee = Number(entry.feeZug ?? 0);
  const net = Math.max(0, gross - fee);
  return {
    id: entry.id,
    side: entry.side,
    traderAddress: entry.traderAddress,
    nativeAmount: entry.zugAmount,
    feeBnb: entry.feeZug ?? "0",
    netBnb: String(net),
    tokenAmount: entry.tokenAmount,
    priceBnb: entry.priceZug,
    txHash: entry.txHash,
    blockTime: entry.blockTime,
  };
}

/** Redis hot ring supplements PG — never replace full history with hot-only slice. */
export function mergeTapeTrades(
  hot: TradeItem[],
  stored: TradeItem[],
  limit: number
): TradeItem[] {
  const byHash = new Map<string, TradeItem>();
  for (const trade of stored) {
    byHash.set(txHashKey(trade.txHash), trade);
  }
  for (const trade of hot) {
    byHash.set(txHashKey(trade.txHash), trade);
  }
  return [...byHash.values()]
    .sort(
      (a, b) =>
        new Date(b.blockTime).getTime() - new Date(a.blockTime).getTime()
    )
    .slice(0, limit);
}

/**
 * Tape read path (phase 4):
 * - page 1: PostgreSQL (authoritative) merged with Redis hot tail (indexer lag)
 * - deeper pages: ClickHouse trades_raw, PG fallback
 */
export async function listTapeTradesForToken(
  address: string,
  limit: number,
  offset: number
): Promise<TapeTradesResult> {
  if (offset > 0) {
    const fromCh = await listTradesFromClickHouse(address, limit, offset);
    if (fromCh && fromCh.length > 0) {
      return { trades: fromCh, source: "clickhouse" };
    }
    const trades = await listTradesForToken(address, limit, offset);
    return { trades, source: "postgres" };
  }

  const stored = await listTradesForToken(address, limit, offset);
  if (redisUrl()) {
    const hot = await readHotTapeEntries(address, limit).then((entries) =>
      entries.map(hotTapeToTradeItem)
    );
    if (hot.length > 0) {
      const merged = mergeTapeTrades(hot, stored, limit);
      const source: TapeTradesSource =
        hot.length > 0 && stored.length > 0
          ? "merged"
          : hot.length > 0
            ? "redis_hot"
            : "postgres";
      return { trades: merged, source };
    }
  }

  return { trades: stored, source: "postgres" };
}

import type { TradeItem } from "@/lib/db/launchpad";
import { listTradesForToken } from "@/lib/db/launchpad";
import { listTradesFromClickHouse } from "@/lib/clickhouse/trades";
import {
  readHotTapeEntries,
  type HotTapeEntry,
} from "@/lib/redis/hot-cache";
import { redisUrl } from "@/lib/db/perf-flags";

export type TapeTradesSource = "redis_hot" | "clickhouse" | "postgres";

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

/**
 * Tape read path (phase 4):
 * - page 1 (offset=0): Redis hot ring when available
 * - deeper pages: ClickHouse trades_raw, PG fallback
 */
export async function listTapeTradesForToken(
  address: string,
  limit: number,
  offset: number
): Promise<TapeTradesResult> {
  if (offset === 0 && redisUrl()) {
    const hot = await readHotTapeEntries(address, limit);
    if (hot.length > 0) {
      return { trades: hot.map(hotTapeToTradeItem), source: "redis_hot" };
    }
  }

  if (offset > 0) {
    const fromCh = await listTradesFromClickHouse(address, limit, offset);
    if (fromCh && fromCh.length > 0) {
      return { trades: fromCh, source: "clickhouse" };
    }
  }

  const trades = await listTradesForToken(address, limit, offset);
  return { trades, source: "postgres" };
}
